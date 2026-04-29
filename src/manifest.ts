import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json";

// Build target — `firefox` flips a couple of manifest fields that
// Firefox handles differently. Default is Chromium (Chrome / Edge /
// Brave / Arc).
const isFirefox = process.env.BROWSER_TARGET === "firefox";

/**
 * AllyProof browser-extension manifest (MV3).
 *
 * Permissions philosophy: minimum surface area. activeTab + storage
 * + scripting only. We deliberately do NOT request <all_urls> host
 * permission — Chrome Web Store reviewers treat blanket host access
 * on a "scanner" extension as suspicious, and activeTab gives us
 * everything we need on user gesture.
 *
 * No background `tabs` permission either; the popup gets the
 * current tab via chrome.tabs.query({ active: true, currentWindow:
 * true }), which is gated by activeTab on user click.
 */
export default defineManifest({
  manifest_version: 3,
  name: "AllyProof: WCAG Audit, AI Fixes & VPAT",
  short_name: "AllyProof",
  description:
    "Agency-friendly accessibility scanner. Crawl any site, get AI-rewritten fixes, export DRAFT VPAT. WCAG 2.2 AA + EAA + Section 508.",
  version: pkg.version,
  icons: {
    "16": "src/assets/icon-16.png",
    "32": "src/assets/icon-32.png",
    "48": "src/assets/icon-48.png",
    "128": "src/assets/icon-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "src/assets/icon-16.png",
      "32": "src/assets/icon-32.png",
      "48": "src/assets/icon-48.png",
    },
    default_title: "AllyProof — scan this page for WCAG issues",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  // The content script auto-injects on http(s) pages but stays
  // dormant until the popup sends it a "scan/run" message. We need
  // it declared (not programmatically injected) so crxjs bundles
  // it and resolves the build-time path. The "read data on all
  // websites" install warning Chrome shows is the price of any
  // scanner extension that has to read the live DOM — axe DevTools
  // and WAVE both ship with the same warning.
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/scan-runner.ts"],
      run_at: "document_idle",
    },
    {
      // Magic-link bridge — only fires on the AllyProof origin.
      // Listens for window.postMessage from /extension-link and
      // forwards the minted tokens to the service worker.
      matches: ["https://allyproof.com/*", "https://*.allyproof.com/*"],
      js: ["src/content/link-bridge.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage"],
  // No host_permissions array — the matches list above is the
  // origin grant the content script needs. Crawl-mode scans run
  // server-side via /api/v1/scan; the server fetches pages, not
  // the extension.
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true,
  },
  // Side panel — Chrome 114+. Firefox doesn't support sidePanel as
  // of MV3; the entry is omitted there and the popup remains the
  // primary surface.
  ...(isFirefox
    ? {}
    : {
        side_panel: {
          default_path: "src/sidepanel/index.html",
        },
      }),
  // DevTools page — invisible registration entry that calls
  // chrome.devtools.panels.create.
  devtools_page: "src/devtools/index.html",
  // Firefox requires a stable extension ID for development +
  // signing. Chrome derives it from the public key; Firefox needs
  // browser_specific_settings.gecko.id.
  ...(isFirefox
    ? {
        browser_specific_settings: {
          gecko: {
            id: "extension@allyproof.com",
            strict_min_version: "115.0",
            data_collection_permissions: {
              required: [],
            },
          },
        },
      }
    : {}),
});
