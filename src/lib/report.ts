/**
 * Exportable page-report shape. Pure data-in/data-out so agencies
 * can archive scan evidence, diff two scans, or feed results into
 * their own tooling — table stakes for an inspection tool (axe
 * DevTools exports JSON; WAVE exports via API).
 */

import type {
  ProcessedViolation,
  SeverityCounts,
} from "@allyproof/scan-core";
import type { ScanEnvironment } from "@/lib/messages";

export interface PageReportInput {
  url: string;
  pageTitle: string;
  scannedAt: string; // ISO
  durationMs: number;
  score: number;
  counts: SeverityCounts;
  violations: ProcessedViolation[];
  needsReview: ProcessedViolation[];
  environment: ScanEnvironment | null;
}

export function buildPageReport(input: PageReportInput) {
  return {
    tool: "AllyProof",
    format: "allyproof-page-report",
    formatVersion: 1,
    standard: "WCAG 2.2 AA",
    url: input.url,
    pageTitle: input.pageTitle,
    scannedAt: input.scannedAt,
    durationMs: input.durationMs,
    score: input.score,
    counts: input.counts,
    environment: input.environment,
    violations: input.violations,
    needsReview: input.needsReview,
  };
}

/** allyproof-example-com-20260702-1430.json */
export function reportFileName(url: string, scannedAt: string): string {
  let host = "page";
  try {
    host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "") || "page";
  } catch {
    /* keep fallback */
  }
  const d = new Date(scannedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = Number.isNaN(d.getTime())
    ? "unknown"
    : `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `allyproof-${host.replace(/\./g, "-")}-${stamp}.json`;
}

/**
 * Compact relative timestamp for "this result is from …" labels.
 * Falls back to a locale date beyond a week — at that age the exact
 * day matters more than the delta.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${Math.max(1, min)} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
