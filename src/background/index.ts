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
} from "@/lib/messages";
import { appendScan, setAuth } from "@/lib/storage";
import { badgeColor } from "@/lib/scoring";
import type { ScanResultMessage } from "@/lib/messages";

async function injectAndScan(tabId: number): Promise<void> {
  // The content script is auto-injected on http(s) pages by the
  // manifest declaration. It idles until we send it a scan/run
  // message — at which point it loads axe-core and reports back.
  // chrome.tabs.sendMessage fails if the tab is on a non-matching
  // origin (chrome://, about:, the Web Store) — surfaced to the
  // popup as a friendly "this page can't be scanned" error.
  await chrome.tabs.sendMessage(tabId, { type: "scan/run" });
}

async function setBadgeForTab(tabId: number, score: number): Promise<void> {
  const text = score >= 100 ? "100" : `${score}`;
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: badgeColor(score),
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
      await setBadgeForTab(tabId, r.score);
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
    void setAuth(link.data.tokens);
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

export {};
