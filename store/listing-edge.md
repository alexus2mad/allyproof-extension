# Microsoft Edge Add-ons listing

> Edge accepts the same Chromium MV3 zip as Chrome — upload
> `release/allyproof-chrome-vX.Y.Z.zip` directly. Listing fields are
> mostly identical to Chrome; the few differences are noted below.

## Upload artifact
`release/allyproof-chrome-vX.Y.Z.zip`

## Name
AllyProof: WCAG Audit, AI Fixes & VPAT

## Short description (max 200 chars on Edge)
Scan any page for WCAG 2.2 AA accessibility issues. Industry-standard axe-core engine runs locally; AI fix suggestions, multi-site dashboard, and DRAFT VPAT export when you connect an account.

## Description
Use the same long-form copy as `listing-chrome.md`. Edge has no length limit issue.

## Category
Developer Tools.

## Privacy policy URL
https://allyproof.com/privacy

## Privacy practices
- Data collected: Account info (email, name) when user signs in; scan results when user explicitly saves them.
- Data shared with third parties: No.
- Encryption: All data in transit uses TLS.
- Data deletion: User-initiated from `/settings` or by emailing `legal@allyproof.com`.

## Permissions
Same justifications as Chrome — see `permissions-justifications.md`.

## Notes for the Microsoft reviewer
- The extension does not load remote JavaScript.
- The extension does not request `<all_urls>` host permission.
- Scans only run on user gesture (toolbar icon click); the dormant content script is required because Chrome / Edge MV3 only allows on-gesture injection of pre-declared content scripts.

## Distribution
- Visibility: Public
- Regions: All
- Age rating: Everyone
