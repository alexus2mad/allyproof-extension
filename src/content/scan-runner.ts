/**
 * Content script — runs axe-core inside the audited page's MAIN
 * world via chrome.scripting and pipes the results back through
 * @allyproof/scan-core for ProcessedViolation shape + scoring.
 *
 * Why this lives here: axe-core needs access to the live DOM. The
 * service worker is DOM-less; the popup runs in its own document
 * (not the audited page's). Only a content script (or a MAIN-world
 * script injected via chrome.scripting.executeScript) sees the
 * page DOM.
 *
 * Engine scope (Phase 1 MVP): axe-core only. HTMLCS + APCA come
 * incrementally in Phase 2. axe alone covers ~57% of automated
 * issue-level WCAG coverage and is the engine the dashboard score
 * is anchored to.
 */

import axe from "axe-core";
import {
  AXE_WCAG_TAGS,
  EXPERIMENTAL_RULES,
  PROMOTED_BEST_PRACTICE_RULES,
  extractWcagCriteria,
  aggregateSeverityCountsFromProcessed,
  computeSiteScore,
} from "@allyproof/scan-core";
import type { ProcessedViolation, ViolationImpact } from "@allyproof/scan-core";
import {
  scanResultMessage,
  scanErrorMessage,
  runScanCommand,
  highlightNodeCommand,
} from "@/lib/messages";
import type { ScanEnvironment } from "@/lib/messages";
import { flattenTarget, splitSelectorChain } from "@/lib/target";

/**
 * Duplicate-copy dispatch lock. The background falls back to
 * chrome.scripting.executeScript when the static declaration didn't
 * fire (tab predates install) — and that can land while a copy of
 * this script is ALREADY live. Each injected copy is a fresh module
 * with its own listener and its own scanInFlight, so two live
 * copies means every scan runs twice and every result is stored
 * twice.
 *
 * All copies share the tab's isolated world, so a window global
 * arbitrates: for each message dispatch (delivered to every copy's
 * listener back-to-back), only the first copy to claim the key
 * within the window handles it.
 *
 * Deliberately NOT a register-once sentinel: after an extension
 * reload the orphaned copy's sentinel would still be set and would
 * permanently mute the freshly injected copy. Orphaned copies stop
 * receiving messages entirely, so a per-dispatch lock has no such
 * failure mode.
 */
declare global {
  interface Window {
    __ALLYPROOF_DISPATCH__?: Record<string, number>;
  }
}

function claimDispatch(key: string): boolean {
  const store = (window.__ALLYPROOF_DISPATCH__ ??= {});
  const now = Date.now();
  if (now - (store[key] ?? 0) < 300) return false;
  store[key] = now;
  return true;
}

/**
 * sendMessage throws "Extension context invalidated" if the
 * extension was reloaded/updated while this orphaned copy is still
 * attached to the page. Nothing useful can be done — the new
 * extension version will inject a fresh copy — so swallow instead
 * of spraying unhandled rejections into the audited page's console.
 */
function safeSend(message: unknown): void {
  try {
    void chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    /* context invalidated */
  }
}

/**
 * Determinism gate — the #1 source of "same site, different results
 * on my other PC" reports was scanning at whatever load state the
 * page happened to be in when the user clicked. axe reads the LIVE
 * render: color-contrast needs final colors and web fonts,
 * target-size needs settled layout, and lazily-hydrated DOM simply
 * isn't there yet on a slow machine. A fast desktop on fiber scans
 * a finished page; a laptop on hotel Wi-Fi scans a half-loaded one
 * — different DOM, different violations, same URL.
 *
 * So before running axe we wait for, each with a hard cap so a
 * page that never finishes (infinite spinners, hung trackers)
 * can't wedge the scan:
 *   1. window load  — images + stylesheets (cap 10s)
 *   2. fonts.ready  — web fonts swap text metrics, which moves
 *      layout under target-size and can change which element is
 *      the contrast background (cap 3s)
 *   3. double rAF   — one committed frame after both, so style/
 *      layout recalc from late arrivals is flushed
 */
const LOAD_SETTLE_CAP_MS = 10_000;
const FONTS_SETTLE_CAP_MS = 3_000;

function afterTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPageSettled(): Promise<void> {
  if (document.readyState !== "complete") {
    await Promise.race([
      new Promise<void>((resolve) =>
        window.addEventListener("load", () => resolve(), { once: true })
      ),
      afterTimeout(LOAD_SETTLE_CAP_MS),
    ]);
  }
  try {
    await Promise.race([
      document.fonts.ready.then(() => undefined),
      afterTimeout(FONTS_SETTLE_CAP_MS),
    ]);
  } catch {
    // FontFaceSet.ready can reject on individual font failures —
    // the page is as settled as it's going to get.
  }
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

function captureEnvironment(axeVersion: string): ScanEnvironment {
  const matches = (query: string) => window.matchMedia(query).matches;
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    colorScheme: matches("(prefers-color-scheme: dark)") ? "dark" : "light",
    forcedColors: matches("(forced-colors: active)"),
    reducedMotion: matches("(prefers-reduced-motion: reduce)"),
    language: navigator.language,
    userAgent: navigator.userAgent,
    axeVersion,
    extensionVersion: chrome.runtime.getManifest().version,
  };
}

// Overlapping runs are axe's other nondeterminism trap: a second
// axe.run while one is in flight throws "Axe is already running",
// which surfaced as a spurious scan error on double-click. One run
// at a time; concurrent requests are dropped (the in-flight run's
// result message serves both).
let scanInFlight = false;

async function runScan(): Promise<void> {
  if (scanInFlight) return;
  scanInFlight = true;
  const startedAt = performance.now();
  try {
    // Our own highlight overlay must not be part of the audited DOM.
    clearHighlight();
    await waitForPageSettled();

    const results = await axe.run(document, {
      runOnly: { type: "tag", values: [...AXE_WCAG_TAGS] },
      rules: { ...EXPERIMENTAL_RULES },
      // axe defaults to iframes:true, which postMessage-probes every
      // child frame for an axe instance. We only inject into the top
      // frame, so those probes NEVER succeed — they just race a
      // timeout whose outcome depends on how many ad/embed frames had
      // loaded on that particular machine at that particular moment.
      // That race was a direct cause of cross-machine result drift.
      // Disable it: deterministic top-document scan. Real iframe
      // coverage means injecting the runner all_frames (Phase 2) —
      // NOT re-enabling this flag on a top-frame-only install.
      iframes: false,
    });

    const violations = results.violations.map(toProcessed);
    // axe "incomplete" = checks it could not decide automatically
    // (contrast over an image, aria references it can't resolve…).
    // Competitor scanners surface these as "needs review" — dropping
    // them silently under-reports. They are NOT violations: excluded
    // from counts and score, shown in their own section.
    const needsReview = results.incomplete.map(toProcessed);

    const counts = aggregateSeverityCountsFromProcessed(violations);
    const score = computeSiteScore(counts);
    const durationMs = Math.round(performance.now() - startedAt);

    const message = scanResultMessage.parse({
      type: "scan/result",
      url: window.location.href,
      pageTitle: document.title.slice(0, 200),
      durationMs,
      violations,
      counts,
      score,
      environment: captureEnvironment(results.testEngine.version),
      needsReview,
    });
    safeSend(message);
  } catch (err) {
    const message = scanErrorMessage.parse({
      type: "scan/error",
      message: err instanceof Error ? err.message : String(err),
    });
    safeSend(message);
  } finally {
    scanInFlight = false;
  }
}

function toProcessed(v: axe.Result): ProcessedViolation {
  const promoted = PROMOTED_BEST_PRACTICE_RULES[v.id];
  const wcagCriteria = promoted ? [...promoted] : extractWcagCriteria(v.tags);
  const isBestPractice = !promoted && v.tags.includes("best-practice");
  return {
    ruleId: v.id,
    impact: (v.impact ?? "minor") as ViolationImpact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    wcagCriteria,
    isBestPractice,
    source: "axe",
    nodes: v.nodes.map((n) => ({
      html: (n.html ?? "").slice(0, 500),
      // axe target entries are string | string[] — the array form is
      // a shadow-DOM chain. Flatten so the shared ProcessedNode
      // string[] shape holds; highlight splits it back apart.
      target: flattenTarget(n.target as ReadonlyArray<string | string[]>),
      failureSummary: n.failureSummary ?? "",
    })),
  };
}

/**
 * Visual element highlighter. Scrolls the element into view and
 * draws a labelled outline overlay that stays visible until the
 * user dismisses it explicitly — no auto-timeout. Three ways to
 * clear:
 *   - Press Escape
 *   - Click the overlay itself
 *   - Trigger another highlight (the new one replaces it)
 *
 * Implementation choices:
 *   - The overlay is a position:fixed div placed by
 *     getBoundingClientRect (NOT a class added to the target),
 *     so the target's stylesheet, layout, and event handlers are
 *     untouched.
 *   - Shadow DOM hosts the overlay so the audited page's CSS
 *     can't leak through and skew the visuals.
 *   - clearHighlight is exposed so a follow-up highlight resets
 *     the previous one before drawing the new.
 */
const HIGHLIGHT_HOST_ID = "__allyproof_highlight_root__";

let highlightEscHandler: ((e: KeyboardEvent) => void) | null = null;

function clearHighlight() {
  const host = document.getElementById(HIGHLIGHT_HOST_ID);
  if (host) host.remove();
  if (highlightEscHandler) {
    document.removeEventListener("keydown", highlightEscHandler, true);
    highlightEscHandler = null;
  }
}

function drawOverlay(target: Element, label?: string): void {
  const rect = target.getBoundingClientRect();
  clearHighlight();

  const host = document.createElement("div");
  host.id = HIGHLIGHT_HOST_ID;
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });

  const box = document.createElement("div");
  box.style.cssText = [
    "position:fixed",
    `top:${rect.top - 4}px`,
    `left:${rect.left - 4}px`,
    `width:${rect.width + 8}px`,
    `height:${rect.height + 8}px`,
    "border:2px solid #10b981",
    "border-radius:4px",
    "box-shadow:0 0 0 2px rgba(16,185,129,0.25), 0 8px 24px rgba(0,0,0,0.18)",
    "background:rgba(16,185,129,0.06)",
    "transition:opacity 200ms ease",
    "opacity:0",
    "pointer-events:auto",
    "cursor:pointer",
  ].join(";");
  box.title = "Click to dismiss · or press Esc";
  box.addEventListener("click", clearHighlight);
  root.appendChild(box);

  if (label) {
    const tag = document.createElement("div");
    tag.style.cssText = [
      "position:fixed",
      `top:${Math.max(8, rect.top - 28)}px`,
      `left:${rect.left - 4}px`,
      "padding:2px 6px",
      "background:#10b981",
      "color:#ffffff",
      "font:600 11px/1.2 system-ui,-apple-system,Segoe UI,sans-serif",
      "border-radius:3px",
      "white-space:nowrap",
      "max-width:80vw",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "pointer-events:auto",
      "cursor:pointer",
    ].join(";");
    tag.textContent = `AllyProof — ${label}  ✕`;
    tag.title = "Click to dismiss · or press Esc";
    tag.addEventListener("click", clearHighlight);
    root.appendChild(tag);
  }

  document.documentElement.appendChild(host);
  requestAnimationFrame(() => {
    box.style.opacity = "1";
  });

  // Esc dismisses without leaving the keyboard. Captured at the
  // document level (capture phase) so a focused input on the
  // page doesn't swallow it first.
  highlightEscHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      clearHighlight();
      e.stopPropagation();
    }
  };
  document.addEventListener("keydown", highlightEscHandler, true);
}

/**
 * Resolve a flattened axe selector, walking shadow roots for chain
 * selectors (see lib/target.ts). Closed shadow roots are opaque to
 * axe too, so any chain axe produced is walkable in principle —
 * null just means the element is gone (SPA re-render since scan).
 */
function resolveSelector(selector: string): Element | null {
  const hops = splitSelectorChain(selector);
  let root: Document | ShadowRoot = document;
  let el: Element | null = null;
  for (let i = 0; i < hops.length; i++) {
    try {
      el = root.querySelector(hops[i]!);
    } catch {
      return null; // malformed selector
    }
    if (!el) return null;
    if (i < hops.length - 1) {
      if (!el.shadowRoot) return null;
      root = el.shadowRoot;
    }
  }
  return el;
}

function highlightSelector(selector: string, label?: string): boolean {
  const target = resolveSelector(selector);
  if (!(target instanceof Element)) return false;

  // Kick off the scroll. scrollIntoView is a no-op if the element
  // is already centred, so we don't need a fast-path branch.
  target.scrollIntoView({ behavior: "smooth", block: "center" });

  // Poll the element's position frame-by-frame and only draw the
  // overlay once it has stopped moving. scrollend is unreliable
  // here — on long smooth-scrolls Chrome fires it before the
  // animation actually finishes (especially when nested scroll
  // containers are involved or scroll-snap intercedes). The
  // poll is the only approach that works in all cases:
  //   - already-in-view: stable from frame 1, draws within ~67ms
  //   - smooth scroll in flight: position changing each frame,
  //     keep waiting
  //   - scroll-snap interruption: eventually settles, then draws
  //
  // getBoundingClientRect is one of the cheapest DOM reads; a
  // poll over a few frames is well below the rendering budget
  // and bounded by MAX_WAIT_MS so we can never spin forever.
  const STABLE_FRAMES_REQUIRED = 4;
  const MAX_WAIT_MS = 3000;
  let lastTop = Number.NEGATIVE_INFINITY;
  let lastLeft = Number.NEGATIVE_INFINITY;
  let stableCount = 0;
  const startedAt = performance.now();

  const tick = () => {
    const rect = target!.getBoundingClientRect();
    if (
      Math.abs(rect.top - lastTop) < 0.5 &&
      Math.abs(rect.left - lastLeft) < 0.5
    ) {
      stableCount++;
      if (stableCount >= STABLE_FRAMES_REQUIRED) {
        drawOverlay(target!, label);
        return;
      }
    } else {
      stableCount = 0;
      lastTop = rect.top;
      lastLeft = rect.left;
    }
    if (performance.now() - startedAt > MAX_WAIT_MS) {
      // Ceiling — draw at current position rather than spinning
      // forever (some pages have continuous animation that never
      // settles).
      drawOverlay(target!, label);
      return;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
  return true;
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const scan = runScanCommand.safeParse(raw);
  if (scan.success) {
    if (claimDispatch("scan/run")) void runScan();
    sendResponse({ ok: true });
    return false;
  }
  const highlight = highlightNodeCommand.safeParse(raw);
  if (highlight.success) {
    const ok = claimDispatch(`hl:${highlight.data.selector}`)
      ? highlightSelector(highlight.data.selector, highlight.data.label)
      : true; // another live copy already handled this dispatch
    sendResponse({ ok });
    return false;
  }
  return false;
});
