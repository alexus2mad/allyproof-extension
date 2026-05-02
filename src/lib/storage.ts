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

/**
 * Where the panel surface (full-results view) lives.
 *   right     — native chrome.sidePanel docked right (the only true
 *               dock; Chrome's API doesn't let us pick a side).
 *   left      — popup window pinned to the screen's left edge.
 *   bottom    — popup window pinned to the screen's bottom edge.
 *   detached  — free-floating popup window centered on screen.
 *
 * left/bottom/detached are all `chrome.windows.create({type:"popup"})`
 * with different positioning. They float over the page rather than
 * truly docking — Chrome MV3 has no API for left-dock or bottom-dock.
 */
export type DockMode = "right" | "left" | "bottom" | "detached";

export interface ExtensionSettings {
  /** Off by default — opt-in only. */
  telemetryEnabled: boolean;
  /** "system" follows OS preference; "light"/"dark" override. */
  theme: "system" | "light" | "dark";
  /** API base — defaults to prod, override for self-hosted / staging. */
  apiBase: string;
  /** Where the full-results panel opens. Default: right (native side panel). */
  dockMode: DockMode;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  telemetryEnabled: false,
  theme: "system",
  apiBase: "https://allyproof.com",
  dockMode: "right",
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

// ── Detached panel window tracking ────────────────────────────────
//
// When the dock mode is left/bottom/detached we open the panel via
// chrome.windows.create({type:"popup"}). The window id is stored in
// session storage so we can close + reopen it on mode-switch and
// avoid spawning duplicate panel windows. Cleared on browser
// restart (session scope) or when chrome.windows.onRemoved fires
// for the tracked id.

export async function getPanelWindowId(): Promise<number | null> {
  const stored = await chrome.storage.session.get("panelWindowId");
  const id = stored.panelWindowId as number | undefined;
  return typeof id === "number" ? id : null;
}

export async function setPanelWindowId(id: number | null): Promise<void> {
  if (id == null) {
    await chrome.storage.session.remove("panelWindowId");
  } else {
    await chrome.storage.session.set({ panelWindowId: id });
  }
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
