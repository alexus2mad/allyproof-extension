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
 * Visual element highlighter. Mirrors what axe DevTools does in
 * its non-DevTools surfaces: scrolls the element into view and
 * draws a labelled outline overlay for a few seconds. The
 * extension's popup can't call chrome.devtools.inspectedWindow.eval
 * (that API is gated to devtools-context pages), so highlighting
 * via DOM manipulation is the closest equivalent we get from the
 * popup.
 *
 * Implementation choices:
 *   - The overlay is a position:fixed div placed by getBoundingClientRect
 *     (NOT a class added to the target). That way the target's own
 *     stylesheet, layout, and event handlers are completely untouched.
 *   - shadow DOM hosts our overlay so the audited page's CSS can't
 *     leak through and skew the visuals.
 *   - The overlay self-removes after 3.5s; we also expose a clear
 *     handle so a follow-up highlight cleans the previous one up first.
 */
const HIGHLIGHT_HOST_ID = "__allyproof_highlight_root__";
const HIGHLIGHT_DURATION_MS = 3500;

function clearHighlight() {
  const host = document.getElementById(HIGHLIGHT_HOST_ID);
  if (host) host.remove();
}

function highlightSelector(selector: string, label?: string): boolean {
  let target: Element | null = null;
  try {
    target = document.querySelector(selector);
  } catch {
    return false;
  }
  if (!(target instanceof Element)) return false;

  // Scroll into view first so the overlay coordinates we capture
  // afterward are post-scroll.
  target.scrollIntoView({ behavior: "smooth", block: "center" });

  // Pause briefly to let smooth scroll settle, then position the
  // overlay. Using a small timeout instead of scrollend (which is
  // patchily supported and skips on prefers-reduced-motion).
  window.setTimeout(() => {
    const rect = target!.getBoundingClientRect();
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
    ].join(";");
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
      ].join(";");
      tag.textContent = `AllyProof — ${label}`;
      root.appendChild(tag);
    }

    document.documentElement.appendChild(host);
    // Fade in next frame so the transition runs.
    requestAnimationFrame(() => {
      box.style.opacity = "1";
    });

    window.setTimeout(clearHighlight, HIGHLIGHT_DURATION_MS);
  }, 220);

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
