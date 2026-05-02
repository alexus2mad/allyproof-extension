/**
 * Score color helper — duplicated from the platform's
 * getScoreColorClasses but using Tailwind v4 utility classes that
 * exist in this bundle.
 *
 * The pure scoring math (computeSiteScore, getScoreColor band
 * classification) comes from @allyproof/scan-core so the extension
 * shows the same number the dashboard does.
 */

import { getScoreColor } from "@allyproof/scan-core";
import type { ScoreColor, SeverityCounts } from "@allyproof/scan-core";

export function scoreColorClasses(score: number): {
  text: string;
  bg: string;
  border: string;
  bar: string;
} {
  const color: ScoreColor = getScoreColor(score);
  switch (color) {
    case "green":
      return {
        text: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        border: "border-emerald-200 dark:border-emerald-900",
        bar: "bg-emerald-500",
      };
    case "amber":
      return {
        text: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/40",
        border: "border-amber-200 dark:border-amber-900",
        bar: "bg-amber-500",
      };
    case "red":
      return {
        text: "text-red-600 dark:text-red-400",
        bg: "bg-red-50 dark:bg-red-950/40",
        border: "border-red-200 dark:border-red-900",
        bar: "bg-red-500",
      };
  }
}

/** Toolbar badge color (4-char hex, no leading #). */
export function badgeColor(score: number | null): string {
  if (score === null) return "#9ca3af"; // gray-400 — not yet scanned
  const c = getScoreColor(score);
  if (c === "green") return "#10b981";
  if (c === "amber") return "#f59e0b";
  return "#ef4444";
}

/**
 * Toolbar badge color driven by violation severity counts. Picks
 * the color of the worst severity present so the operator can read
 * the badge at a glance without opening the popup:
 *   any critical → red
 *   any serious  → orange
 *   any moderate → amber
 *   only minor   → gray
 *   nothing      → emerald
 */
export function badgeColorForCounts(counts: SeverityCounts): string {
  if (counts.critical > 0) return "#ef4444"; // red-500
  if (counts.serious > 0) return "#f97316"; // orange-500
  if (counts.moderate > 0) return "#f59e0b"; // amber-500
  if (counts.minor > 0) return "#9ca3af"; // gray-400
  return "#10b981"; // emerald-500
}
