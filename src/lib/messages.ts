/**
 * Typed message contracts between the extension's three runtimes:
 * popup ↔ background service worker ↔ content script.
 *
 * One discriminated union per direction. Zod parses both inbound
 * and outbound messages — never trust an incoming chrome.runtime
 * message just because the type system thinks it's well-formed.
 */

import { z } from "zod";
import type {
  ProcessedViolation,
  SeverityCounts,
} from "@allyproof/scan-core";

// ── Popup → Background ────────────────────────────────────────────

export const startScanRequest = z.object({
  type: z.literal("scan/start"),
  tabId: z.number().int().nonnegative(),
});
export type StartScanRequest = z.infer<typeof startScanRequest>;

// ── Background → Content script ───────────────────────────────────

export const runScanCommand = z.object({
  type: z.literal("scan/run"),
});
export type RunScanCommand = z.infer<typeof runScanCommand>;

// ── Content script → Background ───────────────────────────────────

export const scanResultMessage = z.object({
  type: z.literal("scan/result"),
  url: z.string().url(),
  pageTitle: z.string(),
  durationMs: z.number().nonnegative(),
  // Stringified ProcessedViolation[] — chrome.runtime.sendMessage
  // serializes via structured clone but Zod can't easily express
  // the recursive ProcessedViolation type. We trust the local
  // builder (this code lives in our own bundle) and validate the
  // top-level shape only.
  violations: z.array(z.unknown()),
  counts: z.object({
    critical: z.number().int().nonnegative(),
    serious: z.number().int().nonnegative(),
    moderate: z.number().int().nonnegative(),
    minor: z.number().int().nonnegative(),
  }),
  score: z.number().int().min(0).max(100),
});
export type ScanResultMessage = z.infer<typeof scanResultMessage> & {
  violations: ProcessedViolation[];
  counts: SeverityCounts;
};

export const scanErrorMessage = z.object({
  type: z.literal("scan/error"),
  message: z.string(),
});
export type ScanErrorMessage = z.infer<typeof scanErrorMessage>;

export const allMessagesSchema = z.discriminatedUnion("type", [
  startScanRequest,
  runScanCommand,
  scanResultMessage,
  scanErrorMessage,
]);
export type AllMessages = z.infer<typeof allMessagesSchema>;
