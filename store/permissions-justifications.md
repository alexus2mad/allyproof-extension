# Permission justifications

> Required by all three stores. Each block is paste-ready for the matching
> permission field in the store admin form. Reviewers compare these against
> the actual code, so don't embellish — keep them factual and tight.

## `activeTab`

The extension reads the active tab's URL and runs an accessibility scan
inside that tab — but only when the user clicks the AllyProof toolbar
icon or the "Scan this page" button. This permission is granted by the
browser on user gesture and revoked when the user navigates away or
closes the tab. Without `activeTab`, the extension cannot inject the
axe-core scanner into the page the user is asking us to audit.

## `tabs`

The side panel surface persists across tab switches. To show "scan
results for the tab you're currently viewing" — including the page
title and URL header in the panel — the extension needs to read
`tab.url` and `tab.title` for the active tab as the user moves between
tabs. `activeTab` alone hides those fields for tabs the user hasn't
explicitly granted, which breaks the core UX of the panel.

`tabs` grants tab metadata only (URL, title, favicon, status). It does
not grant host access — the extension still cannot read the page DOM
or run scripts in any tab without an `activeTab` user gesture.
This is the same permission scope used by axe DevTools, WAVE, and
Lighthouse extensions for the same reason.

## `storage`

The extension uses `chrome.storage.local` and `chrome.storage.session`
to persist the user's settings (theme, panel dock mode), the most
recent 50 scan results for the current device, and (only when the user
chooses to sign in) the access + refresh tokens for their AllyProof
dashboard. `chrome.storage.sync` is deliberately never used.

## `sidePanel`

The extension opens an in-browser side panel that lists every WCAG
violation found on the scanned page next to the page itself, so the
user can fix issues without losing context. `chrome.sidePanel.open()`
is the only way to programmatically open the panel from the action
popup's "Show all issues" button.

## `scripting`

When the user clicks "Scan this page", the extension first tries to
deliver the scan command to the auto-injected content script declared
in the manifest. If the target tab was open *before* the extension
was installed or reloaded, that static injection never ran — the
sendMessage fails with "Receiving end does not exist". `scripting`
lets the background worker fall back to `chrome.scripting.executeScript`
to inject the same scan-runner file (the exact path is read from
`chrome.runtime.getManifest().content_scripts`, so it cannot be
re-pointed at arbitrary code) and retry. Without this permission, any
pre-existing tab would silently fail to scan.

## Host permissions: none

The manifest deliberately does NOT request `<all_urls>` or any other
host permission. The two declared `content_scripts` cover only:

1. `http://*/*` and `https://*/*` for the dormant scanner script that
   sits idle until the user clicks "Scan this page" — required because
   the scanner has to be present in the page when the user clicks the
   toolbar icon, and Chrome injection on user gesture only works for
   pre-declared content scripts.
2. `https://allyproof.com/*` and `https://*.allyproof.com/*` for the
   sign-in bridge that receives the magic-link token from the
   AllyProof website.

We do not read background tabs, do not access browsing history, and do
not run on any other origin.

## Remote code: none

The extension does not load JavaScript from the network. All bundled
code ships in the store-signed package. `eval()` and equivalent
constructs are not used.
