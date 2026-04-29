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

chrome.runtime.onMessage.addListener((raw) => {
  const parsed = runScanCommand.safeParse(raw);
  if (!parsed.success) return; // ignore unrelated traffic
  void runScan();
});
