# Firefox AMO listing (addons.mozilla.org)

> Upload `release/allyproof-firefox-vX.Y.Z.zip` as the extension. Upload
> `release/allyproof-source-vX.Y.Z.zip` as the source-code attachment
> (Mozilla policy requires source whenever a bundler minifies code).

## Upload artifact
`release/allyproof-firefox-vX.Y.Z.zip`

## Source code attachment (required)
`release/allyproof-source-vX.Y.Z.zip`

When uploading, AMO asks "Do you use minified, concatenated, or otherwise
machine-generated code?" — answer **Yes**, then attach the source zip
and use the build instructions below.

## Build instructions for the AMO reviewer

To reproduce the uploaded extension zip from the source archive:

```
unzip allyproof-source-vX.Y.Z.zip
cd allyproof-source-vX.Y.Z
npm ci
npm run build:firefox
# The reviewable artifact is then ./dist/
```

The output should match the contents of the uploaded extension zip.
Operating system: Linux, macOS, or Windows. Node.js: 20 LTS or newer.

## Name
AllyProof: WCAG Audit, AI Fixes & VPAT

## Summary (max 250 chars)
Scan any page for WCAG 2.2 AA accessibility issues. Industry-standard axe-core engine runs locally; sign in for AI fix suggestions, multi-site dashboard, and DRAFT VPAT export.

## Description
Use the same long-form copy as `listing-chrome.md`.

## Categories
Web Development (primary). Tabs (secondary, if requested).

## Tags
accessibility, wcag, a11y, audit, axe, vpat, ada, section-508, eaa

## Privacy policy URL
https://allyproof.com/privacy

## Support email
support@allyproof.com

## Support site
https://allyproof.com/support

## License
MIT (matches the LICENSE file in the source zip).

## Notes to reviewer
- The extension's primary scanner is `@axe-core/axe-core` (MIT) bundled inside the build.
- Local scans run entirely in the user's browser — no network calls until the user signs in.
- Sign-in opens https://allyproof.com/extension-link in a new tab; that page posts a one-time token back to the extension via `window.postMessage`. The bridge content script is restricted to the AllyProof origin (`https://*.allyproof.com/*`).
- The extension does not request `<all_urls>` host permission. The two declared content scripts cover the dormant scanner (HTTP/HTTPS) and the sign-in bridge (AllyProof origins only).
- `chrome.storage.sync` is intentionally not used.
