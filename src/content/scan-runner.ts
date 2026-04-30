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

async function runScan(): Promise<void> {
  const startedAt = performance.now();
  try {
    const results = await axe.run(document, {
      runOnly: { type: "tag", values: [...AXE_WCAG_TAGS] },
      rules: { ...EXPERIMENTAL_RULES },
    });

    const violations: ProcessedViolation[] = results.violations.map((v) => {
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
          target: n.target as string[],
          failureSummary: n.failureSummary ?? "",
        })),
      };
    });

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
    });
    chrome.runtime.sendMessage(message);
  } catch (err) {
    const message = scanErrorMessage.parse({
      type: "scan/error",
      message: err instanceof Error ? err.message : String(err),
    });
    chrome.runtime.sendMessage(message);
  }
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

function isInViewport(rect: DOMRect): boolean {
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
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

function highlightSelector(selector: string, label?: string): boolean {
  let target: Element | null = null;
  try {
    target = document.querySelector(selector);
  } catch {
    return false;
  }
  if (!(target instanceof Element)) return false;

  // Fast path: element is already on screen — draw immediately,
  // no scroll, no waiting.
  if (isInViewport(target.getBoundingClientRect())) {
    drawOverlay(target, label);
    return true;
  }

  // Slow path: scroll into view, then draw AFTER scroll settles.
  // Previously we used a fixed 220ms timeout, but smooth scroll
  // on long pages takes 500-1000ms+ — drawing mid-scroll left the
  // overlay anchored to mid-scroll viewport coords (off-screen by
  // the time scroll completed), which manifested as "highlight
  // doesn't appear unless I click Show again."
  //
  // scrollend (Chrome 114+) is the right event: fires once after
  // smooth scroll finishes. We also arm a generous timeout
  // fallback in case scrollend never fires (rare — happens when
  // a CSS scroll-snap intervenes mid-flight, or on engines that
  // skip smooth scroll for prefers-reduced-motion).
  target.scrollIntoView({ behavior: "smooth", block: "center" });

  let drawn = false;
  const drawOnce = () => {
    if (drawn) return;
    drawn = true;
    document.removeEventListener("scrollend", drawOnce);
    drawOverlay(target!, label);
  };

  document.addEventListener("scrollend", drawOnce, { once: true });
  // Fallback: 1.2s is generous for smooth scroll on long pages
  // and bounded enough that the user perceives it as snappy.
  window.setTimeout(drawOnce, 1200);

  return true;
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const scan = runScanCommand.safeParse(raw);
  if (scan.success) {
    void runScan();
    return false;
  }
  const highlight = highlightNodeCommand.safeParse(raw);
  if (highlight.success) {
    const ok = highlightSelector(highlight.data.selector, highlight.data.label);
    sendResponse({ ok });
    return false;
  }
  return false;
});
