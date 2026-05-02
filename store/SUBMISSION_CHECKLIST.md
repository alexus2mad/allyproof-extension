# Submission checklist — 0 → live in all three stores

Tick boxes as you go. Phase numbers are dependencies — don't start a
phase until the previous one is green.

---

## Phase 0 — already done (for reference)

- [x] Code complete: 1.0.0 builds clean, type-checked, no console errors in any of the 4 dock modes
- [x] Three release zips in `release/`: `allyproof-chrome-v1.0.0.zip`, `allyproof-firefox-v1.0.0.zip`, `allyproof-source-v1.0.0.zip`
- [x] Reviewer-facing docs in `store/`: single-purpose, permission justifications, listing copy ×3, screenshots checklist, changelog
- [x] Legal pages updated on allyproof.com (privacy §13, terms §18, trust) — pushed in commit `dfd2c2b`
- [x] README documents the release flow

---

## Phase 1 — local smoke test (~30 min, you)

Reload the unpacked extension first (`chrome://extensions` → refresh
icon on AllyProof) so you're testing the latest dist.

- [ ] Action popup opens, shows score + severity counts after a scan
- [ ] "Show all N issues" CTA opens whichever dock mode is set
- [ ] Side panel docks **right** (default), full violation list visible
- [ ] Dock switcher → **left** opens a popup window pinned to screen-left edge
- [ ] Dock switcher → **bottom** opens a popup window pinned to screen-bottom edge
- [ ] Dock switcher → **detached** opens a centered free-floating window
- [ ] Switching modes closes the previous surface (no double-panel)
- [ ] Toolbar badge shows live violation count, color matches worst severity
- [ ] "Show on page" button highlights the failing element on the live DOM
- [ ] Sign-in flow (magic link from popup → allyproof.com → tokens land back in extension)
- [ ] Save-to-dashboard succeeds when signed in
- [ ] Generate AI fix returns a markdown suggestion when signed in
- [ ] Re-scan replaces the stored result without dupes
- [ ] No errors in the service-worker console (`chrome://extensions` → "service worker" → Inspect)

If anything fails: file an issue, fix, bump to 1.0.1, regenerate zips.

---

## Phase 2 — screenshots (~1–2 hours, you)

Window size: 1280 × 800 viewport. Use Win+Shift+S, then crop in any
editor. Save to `store/screenshots/` as listed in `screenshots/README.md`.

- [ ] `01-popup-result.png` — action popup after scan
- [ ] `02-side-panel-right.png` — side panel docked right with violation list
- [ ] `03-show-on-page.png` — page with AllyProof highlight overlay
- [ ] `04-ai-fix.png` — side panel showing generated AI fix drawer
- [ ] `05-dock-modes.png` — composite or detached-window shot

Optional Chrome promo art (only if you want a shot at the Chrome
"Featured" carousel):

- [ ] `screenshots/promo/promo-440x280.png` — small tile
- [ ] `screenshots/promo/promo-1400x560.png` — marquee

Strip EXIF before saving (most editors do this on save).

---

## Phase 3 — verify the privacy URL is live (~5 min, you)

The CI deploy of commit `dfd2c2b` should be done by now. Check before
submitting — store reviewers will fetch this page.

- [ ] `https://allyproof.com/privacy` loads and shows "Last updated: May 2, 2026"
- [ ] Section 13 (Browser Extension) is visible
- [ ] `https://allyproof.com/terms` shows Section 18 (Browser Extension)
- [ ] `https://allyproof.com/trust` shows the Browser Extension subsection

If any are stale, check the GitHub Actions run for the allyproof repo.

---

## Phase 4 — developer accounts (~1 hour total, one-time only, you)

Skip any you already have.

### Chrome Web Store
- [ ] Sign up at https://chrome.google.com/webstore/devconsole/
- [ ] Pay the **$5 one-time** developer registration fee
- [ ] Verify the email address Google asks you to verify

### Microsoft Edge Add-ons
- [ ] Sign up at https://partner.microsoft.com/dashboard/microsoftedge/
- [ ] Free, but requires a Microsoft account
- [ ] Complete the partner profile (name, address, tax info if you ever want to monetize)

### Firefox AMO
- [ ] Sign up at https://addons.mozilla.org/developers/
- [ ] Free; uses any Firefox Account
- [ ] Read the [AMO review policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) — short, worth skimming

---

## Phase 5 — Chrome Web Store submission (~30 min, you)

- [ ] Go to https://chrome.google.com/webstore/devconsole → "New item"
- [ ] Upload `release/allyproof-chrome-v1.0.0.zip`
- [ ] **Store listing tab:** paste from `store/listing-chrome.md`
  - Name, summary, description, category, language
  - Upload all 5 screenshots
  - Upload promo tiles if you made them
  - Privacy policy URL: `https://allyproof.com/privacy`
  - Homepage URL: `https://allyproof.com`
  - Support URL or `mailto:support@allyproof.com`
- [ ] **Privacy practices tab:** answer the data-collection questions (see `permissions-justifications.md` for the truthful answers)
- [ ] Paste single-purpose statement from `store/single-purpose.md`
- [ ] Paste each permission justification from `store/permissions-justifications.md` into the matching field
- [ ] **Distribution tab:** Public, all regions
- [ ] Click **Submit for review**
- [ ] Email confirmation typically arrives within an hour
- [ ] First review usually completes in 1–3 business days; sometimes same-day

If rejected: read the rejection email carefully (Chrome cites the
specific policy section). Common first-time rejections are around
permission justifications or single-purpose clarity — both should be
covered by the docs in this folder.

---

## Phase 6 — Microsoft Edge Add-ons submission (~20 min, you)

Mostly identical to Chrome. Edge accepts the same Chromium zip.

- [ ] Go to https://partner.microsoft.com/dashboard/microsoftedge/ → "Submit a new extension"
- [ ] Upload the same `release/allyproof-chrome-v1.0.0.zip`
- [ ] **Properties:** paste from `store/listing-edge.md`
- [ ] **Privacy:** answer the data-handling questions; URL is `https://allyproof.com/privacy`
- [ ] **Permissions:** paste justifications from `store/permissions-justifications.md`
- [ ] **Availability:** Public, all markets
- [ ] **Notes for certification:** copy the "Notes for the Microsoft reviewer" block from `listing-edge.md`
- [ ] Submit
- [ ] Edge review typically 3–7 business days

---

## Phase 7 — Firefox AMO submission (~30 min, you)

- [ ] Go to https://addons.mozilla.org/developers/addon/submit/distribution
- [ ] Choose **"On this site"** (public listing)
- [ ] Upload `release/allyproof-firefox-v1.0.0.zip`
- [ ] When asked "Do you use minified, concatenated, or otherwise machine-generated code?" → **Yes**
- [ ] Attach `release/allyproof-source-v1.0.0.zip` as the source-code file
- [ ] Paste the **build instructions** block from `store/listing-firefox.md` into the "Build instructions" field
- [ ] **Listing details:** paste from `store/listing-firefox.md`
- [ ] License: MIT
- [ ] Categories: Web Development, Tabs
- [ ] Tags: `accessibility, wcag, a11y, axe, vpat, ada, section-508, eaa`
- [ ] Privacy policy URL: `https://allyproof.com/privacy`
- [ ] Support email: `support@allyproof.com`
- [ ] Notes to reviewer: copy the "Notes to reviewer" block
- [ ] Upload screenshots
- [ ] Submit
- [ ] AMO review: usually 1–7 business days; faster if source review is clean

If AMO flags anything in the source review, the email will list the
exact files and lines. Most issues come from `eval`, remote-script
loading, or unjustified permissions — none of which apply to this
extension.

---

## Phase 8 — post-submission housekeeping (~ongoing)

- [ ] Add the published store URLs to `allyproof.com` landing page (Get the Extension button)
- [ ] Add badges to README: `![chrome](https://img.shields.io/chrome-web-store/v/{id})` etc.
- [ ] Set up a saved search / Slack alert for new user reviews (Chrome dashboard offers email notifications; AMO sends an email per review)
- [ ] Note the published extension ID — pin it via `key` field in manifest if you ever want a stable ID across rebuilds (currently dev-loaded ID is random; published-store ID is stable per listing)

## Subsequent releases

For every release after 1.0.0:

1. Bump `package.json` version
2. Add a new dated section to `store/changelog.md`
3. Re-capture screenshots if the UI changed materially
4. `npm run release:all` → fresh zips in `release/`
5. Re-upload to each store (Chrome / Edge / Firefox dashboards each have a "New version" flow)
6. Paste the matching changelog block into each store's "What's new" field
7. Wait for re-review (typically faster than first submission since the listing exists)

---

## Time + cost budget

| Phase | Time | Cost |
|-------|------|------|
| Smoke test | 30 min | — |
| Screenshots | 1–2 h | — |
| Privacy verify | 5 min | — |
| Dev accounts | 1 h (one-time) | $5 (Chrome only) |
| Chrome submit | 30 min | — |
| Edge submit | 20 min | — |
| Firefox submit | 30 min | — |
| **Total active work** | **3.5 – 5 h** | **$5** |
| Wait for reviews | 1–7 days | — |
| **Time-to-live (all 3 stores)** | **typically 5–10 days** | |
