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

export const highlightNodeCommand = z.object({
  type: z.literal("scan/highlight"),
  selector: z.string().min(1).max(2000),
  label: z.string().max(160).optional(),
});
export type HighlightNodeCommand = z.infer<typeof highlightNodeCommand>;

// ── Popup → Background ────────────────────────────────────────────

export const highlightNodeRequest = z.object({
  type: z.literal("highlight/start"),
  tabId: z.number().int().nonnegative(),
  selector: z.string().min(1).max(2000),
  label: z.string().max(160).optional(),
});
export type HighlightNodeRequest = z.infer<typeof highlightNodeRequest>;

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

// ── Popup / Panel → Background (panel orchestration) ──────────────

/**
 * Open the panel surface in one of the detached modes
 * (left/bottom/detached). Native right-dock is opened directly from
 * the click context with chrome.sidePanel.open() — that API requires
 * a user gesture, which can't be forwarded across runtime messages.
 *
 * `screen` is passed in by the caller because the service worker
 * has no DOM and we'd otherwise need the `system.display`
 * permission.
 */
export const openDetachedPanelRequest = z.object({
  type: z.literal("panel/openDetached"),
  mode: z.enum(["left", "bottom", "detached"]),
  screen: z.object({
    availLeft: z.number().int(),
    availTop: z.number().int(),
    availWidth: z.number().int().positive(),
    availHeight: z.number().int().positive(),
  }),
});
export type OpenDetachedPanelRequest = z.infer<typeof openDetachedPanelRequest>;

/**
 * Close the currently-tracked detached panel window, if any. Used
 * when switching from a detached mode back to native right-dock.
 */
export const closeDetachedPanelRequest = z.object({
  type: z.literal("panel/closeDetached"),
});
export type CloseDetachedPanelRequest = z.infer<typeof closeDetachedPanelRequest>;

// ── Link bridge → Background ──────────────────────────────────────

export const authLinkMessage = z.object({
  type: z.literal("auth/link"),
  tokens: z.object({
    accessToken: z.string().startsWith("ap_ext_"),
    refreshToken: z.string().startsWith("ap_extr_"),
    accessExpiresAt: z.string(),
    refreshExpiresAt: z.string(),
    tokenId: z.string().uuid(),
  }),
  /** Optional: tab id to refocus after the link succeeds. */
  returnTabId: z.number().int().nonnegative().optional(),
});
export type AuthLinkMessage = z.infer<typeof authLinkMessage>;

export const allMessagesSchema = z.discriminatedUnion("type", [
  startScanRequest,
  runScanCommand,
  scanResultMessage,
  scanErrorMessage,
  authLinkMessage,
  highlightNodeCommand,
  highlightNodeRequest,
  openDetachedPanelRequest,
  closeDetachedPanelRequest,
]);
export type AllMessages = z.infer<typeof allMessagesSchema>;
