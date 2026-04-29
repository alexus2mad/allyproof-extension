/**
 * Typed wrappers around chrome.storage.
 *
 * Three buckets used:
 *   - chrome.storage.session  — access token + current scan result
 *     (cleared on browser restart; sensitive but ephemeral)
 *   - chrome.storage.local    — refresh token + last 50 scans + settings
 *   - chrome.storage.sync     — NOT used (sync would push tokens to
 *     other devices linked to the same Chrome profile, expanding
 *     blast radius of a single compromised device)
 */

import type { ProcessedViolation, SeverityCounts } from "@allyproof/scan-core";

export interface StoredScan {
  id: string; // uuid
  url: string;
  pageTitle: string;
  scannedAt: string; // ISO
  durationMs: number;
  score: number;
  counts: SeverityCounts;
  violations: ProcessedViolation[];
  /** Saved to dashboard? null = local-only. */
  dashboardScanId: string | null;
}

export interface ExtensionSettings {
  /** Off by default — opt-in only. */
  telemetryEnabled: boolean;
  /** "system" follows OS preference; "light"/"dark" override. */
  theme: "system" | "light" | "dark";
  /** API base — defaults to prod, override for self-hosted / staging. */
  apiBase: string;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  telemetryEnabled: false,
  theme: "system",
  apiBase: "https://allyproof.com",
};

const SCAN_HISTORY_CAP = 50;

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get("settings");
  const s = stored.settings as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function setSettings(
  patch: Partial<ExtensionSettings>
): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ settings: { ...current, ...patch } });
}

export async function appendScan(scan: StoredScan): Promise<void> {
  const stored = await chrome.storage.local.get("scans");
  const list = (stored.scans as StoredScan[] | undefined) ?? [];
  // Newest first. Trim to cap so storage stays bounded.
  const next = [scan, ...list].slice(0, SCAN_HISTORY_CAP);
  await chrome.storage.local.set({ scans: next });
}

export async function getRecentScans(limit = 10): Promise<StoredScan[]> {
  const stored = await chrome.storage.local.get("scans");
  const list = (stored.scans as StoredScan[] | undefined) ?? [];
  return list.slice(0, limit);
}

// ── Tokens (session-scoped access, local-scoped refresh) ───────────

export interface AuthState {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  tokenId: string;
}

export async function getAuth(): Promise<AuthState | null> {
  const sess = await chrome.storage.session.get("auth");
  const auth = sess.auth as AuthState | undefined;
  return auth ?? null;
}

export async function setAuth(auth: AuthState): Promise<void> {
  // Access token + metadata in session (cleared on browser restart).
  await chrome.storage.session.set({ auth });
  // Refresh token + minimal metadata in local so the next session
  // can rotate without forcing a re-link. Stored separately —
  // session-only auth contains the access token; local auth is the
  // refresh-only mirror.
  await chrome.storage.local.set({
    refresh: {
      refreshToken: auth.refreshToken,
      refreshExpiresAt: auth.refreshExpiresAt,
      tokenId: auth.tokenId,
    },
  });
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.session.remove("auth");
  await chrome.storage.local.remove("refresh");
}

export async function getStoredRefreshToken(): Promise<{
  refreshToken: string;
  refreshExpiresAt: string;
  tokenId: string;
} | null> {
  const stored = await chrome.storage.local.get("refresh");
  const r = stored.refresh as
    | { refreshToken: string; refreshExpiresAt: string; tokenId: string }
    | undefined;
  return r ?? null;
}
