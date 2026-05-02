/**
 * Service worker — the single network-side surface in the extension.
 *
 * Three jobs in Phase 1 MVP:
 *   1. Inject the content script + scan-runner on user click,
 *      then relay the scan/start request from the popup.
 *   2. Receive scan/result messages from the content script,
 *      update the toolbar badge, and persist to chrome.storage.
 *   3. Bridge the popup's "scan now" command to the content script.
 *
 * Network calls (link, refresh, save-to-dashboard) are added in the
 * follow-up tasks. Keep all fetch() in this file so CSP, auth, and
 * URL allow-listing live in one place.
 */

import {
  startScanRequest,
  scanResultMessage,
  scanErrorMessage,
  authLinkMessage,
  highlightNodeRequest,
  openDetachedPanelRequest,
  closeDetachedPanelRequest,
} from "@/lib/messages";
import {
  appendScan,
  setAuth,
  getPanelWindowId,
  setPanelWindowId,
} from "@/lib/storage";
import { badgeColorForCounts } from "@/lib/scoring";
import { totalIssueCount } from "@allyproof/scan-core";
import type { ScanResultMessage } from "@/lib/messages";

const PANEL_PATH = "src/sidepanel/index.html";

/**
 * Compute the chrome.windows.create geometry for a detached panel
 * mode. Pure function so it's trivially unit-testable later.
 */
function geometryFor(
  mode: "left" | "bottom" | "detached",
  screen: {
    availLeft: number;
    availTop: number;
    availWidth: number;
    availHeight: number;
  }
): { left: number; top: number; width: number; height: number } {
  if (mode === "left") {
    return {
      left: screen.availLeft,
      top: screen.availTop,
      width: 440,
      height: screen.availHeight,
    };
  }
  if (mode === "bottom") {
    return {
      left: screen.availLeft,
      top: screen.availTop + screen.availHeight - 340,
      width: screen.availWidth,
      height: 340,
    };
  }
  // detached — centered-ish, comfortable inspector size
  const width = 460;
  const height = Math.min(760, screen.availHeight - 80);
  return {
    left: screen.availLeft + Math.round((screen.availWidth - width) / 2),
    top: screen.availTop + Math.round((screen.availHeight - height) / 3),
    width,
    height,
  };
}

/**
 * Close the currently-tracked detached panel window. No-op if none
 * is tracked or the id is stale (window already closed manually).
 */
async function closeDetachedPanel(): Promise<void> {
  const id = await getPanelWindowId();
  if (id == null) return;
  await chrome.windows.remove(id).catch(() => {
    /* already closed */
  });
  await setPanelWindowId(null);
}

async function openDetachedPanel(
  mode: "left" | "bottom" | "detached",
  screen: {
    availLeft: number;
    availTop: number;
    availWidth: number;
    availHeight: number;
  }
): Promise<void> {
  // If a detached panel is already open, focus + reposition it
  // instead of spawning a duplicate. Mode might have changed, so
  // also update the bounds.
  const existingId = await getPanelWindowId();
  if (existingId != null) {
    const bounds = geometryFor(mode, screen);
    try {
      await chrome.windows.update(existingId, {
        ...bounds,
        focused: true,
        state: "normal",
      });
      return;
    } catch {
      // window was closed out from under us — fall through to create
      await setPanelWindowId(null);
    }
  }

  const bounds = geometryFor(mode, screen);
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(PANEL_PATH),
    type: "popup",
    focused: true,
    ...bounds,
  });
  if (win?.id != null) await setPanelWindowId(win.id);
}

async function injectAndScan(tabId: number): Promise<void> {
  // The content script is auto-injected on http(s) pages by the
  // manifest declaration. It idles until we send it a scan/run
  // message — at which point it loads axe-core and reports back.
  // chrome.tabs.sendMessage fails if the tab is on a non-matching
  // origin (chrome://, about:, the Web Store) — surfaced to the
  // popup as a friendly "this page can't be scanned" error.
  await chrome.tabs.sendMessage(tabId, { type: "scan/run" });
}

async function setBadgeForTab(
  tabId: number,
  counts: ScanResultMessage["counts"]
): Promise<void> {
  // Badge shows the violation count, not the score — operators
  // care most about "how many issues" at-a-glance. Badge text is
  // capped at ~4 visible chars in Chrome's renderer, so 999+ once
  // a page hits four digits.
  const total = totalIssueCount(counts);
  const text = total === 0 ? "" : total > 999 ? "999+" : String(total);
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: badgeColorForCounts(counts),
  });
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  // Popup → "start a scan on this tab"
  const start = startScanRequest.safeParse(raw);
  if (start.success) {
    void injectAndScan(start.data.tabId).catch((err) => {
      // executeScript fails on chrome:// pages, the Web Store
      // origin, etc. Surface a friendly error rather than a
      // silent no-op.
      void chrome.runtime.sendMessage({
        type: "scan/error",
        message:
          err instanceof Error
            ? `Couldn't inject scanner: ${err.message}`
            : "Couldn't inject scanner on this page (browser-internal pages are off-limits).",
      });
    });
    sendResponse({ ok: true });
    return true; // async
  }

  // Content script → scan completed
  const result = scanResultMessage.safeParse(raw);
  if (result.success && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    const r = result.data as ScanResultMessage;
    void (async () => {
      await setBadgeForTab(tabId, r.counts);
      await appendScan({
        id: crypto.randomUUID(),
        url: r.url,
        pageTitle: r.pageTitle,
        scannedAt: new Date().toISOString(),
        durationMs: r.durationMs,
        score: r.score,
        counts: r.counts,
        violations: r.violations,
        dashboardScanId: null,
      });
    })();
  }

  // scan/error — clear the badge so the user knows the previous
  // result is no longer the current page's truth.
  const err = scanErrorMessage.safeParse(raw);
  if (err.success && sender.tab?.id != null) {
    void chrome.action.setBadgeText({ tabId: sender.tab.id, text: "!" });
    void chrome.action.setBadgeBackgroundColor({
      tabId: sender.tab.id,
      color: "#ef4444",
    });
  }

  // Link bridge → store tokens. Only accept from a content script
  // running on the AllyProof origin (the manifest already gates
  // this, but verify sender url just in case).
  const link = authLinkMessage.safeParse(raw);
  if (link.success && sender.url && /^https:\/\/(.*\.)?allyproof\.com\//.test(sender.url)) {
    void (async () => {
      await setAuth(link.data.tokens);
      // Refocus the tab the user was on when they clicked Sign in.
      // We do NOT close the link tab from here: chrome.tabs.remove
      // on a tab that has the side panel currently bound to it
      // collapses the side panel for the whole window (Chromium
      // quirk — the panel re-evaluates options on tab removal and
      // closes if its association is gone). Letting the page show
      // a "you can close this tab" hint avoids the disappearing-
      // sidebar bug; the user's tab clutter is one cmd-W away.
      const returnTabId = link.data.returnTabId;
      setTimeout(() => {
        if (returnTabId != null) {
          void chrome.tabs.update(returnTabId, { active: true }).catch(() => {});
        }
      }, 700);
    })();
    sendResponse({ ok: true });
    return true;
  }

  // Open the panel surface in left/bottom/detached mode (a popup
  // window). Right-mode is opened directly from the click context
  // because chrome.sidePanel.open() requires a user gesture and
  // gestures don't survive runtime message-passing.
  const openDet = openDetachedPanelRequest.safeParse(raw);
  if (openDet.success) {
    void openDetachedPanel(openDet.data.mode, openDet.data.screen);
    sendResponse({ ok: true });
    return true;
  }

  // Close the tracked detached panel window (used when switching
  // back to native right-dock).
  const closeDet = closeDetachedPanelRequest.safeParse(raw);
  if (closeDet.success) {
    void closeDetachedPanel();
    sendResponse({ ok: true });
    return true;
  }

  // Popup → "highlight this selector on tab X". Forward to the
  // tab's content script. Returning true keeps the message channel
  // open for the async sendResponse from the content side.
  const hl = highlightNodeRequest.safeParse(raw);
  if (hl.success) {
    void chrome.tabs
      .sendMessage(hl.data.tabId, {
        type: "scan/highlight",
        selector: hl.data.selector,
        label: hl.data.label,
      })
      .catch(() => {
        /* tab might be on a non-injected origin; the popup will
           surface a soft error message via the resolved value */
      });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// Reset badge when the user navigates — the previous result is no
// longer about this URL.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    void chrome.action.setBadgeText({ tabId, text: "" });
  }
});

// Clear the tracked panel-window id when the user closes it
// manually. Without this the next "open detached" would try to
// focus a stale id, fail, recreate — extra work and a visible
// flicker.
chrome.windows.onRemoved.addListener((windowId) => {
  void (async () => {
    const tracked = await getPanelWindowId();
    if (tracked === windowId) await setPanelWindowId(null);
  })();
});

export {};
