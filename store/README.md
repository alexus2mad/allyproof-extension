# Store submission assets

Everything needed to submit AllyProof to Chrome Web Store, Microsoft Edge
Add-ons, and Firefox AMO. None of this ships with the extension itself —
these files exist only to be uploaded to or pasted into store admin
forms.

## Files in this folder

| File | Audience | When to use |
|------|----------|-------------|
| `single-purpose.md` | Chrome Web Store reviewer | Paste into the "Single purpose" field |
| `permissions-justifications.md` | Chrome / Edge / Firefox reviewers | Paste each justification into the matching permission field; also keep on hand for review responses |
| `listing-chrome.md` | Chrome Web Store admin | Paste into Chrome Web Store dashboard fields |
| `listing-edge.md` | Microsoft Partner Center | Paste into Edge Add-ons listing fields |
| `listing-firefox.md` | addons.mozilla.org | Paste into AMO listing fields |
| `screenshots/README.md` | You | Checklist of screenshots to capture before submitting |
| `changelog.md` | Reviewers + users | Paste the matching version block into each store's "What's new" field on every update |

## Before each submission

1. Bump `package.json` version (semver).
2. Build + pack all artifacts:
   ```bash
   npm run release:all
   ```
   This writes three zips into `release/`:
   - `allyproof-chrome-vX.Y.Z.zip` → Chrome + Edge
   - `allyproof-firefox-vX.Y.Z.zip` → Firefox AMO
   - `allyproof-source-vX.Y.Z.zip` → Firefox AMO source attachment
3. Confirm screenshots in `store/screenshots/` are current (re-capture if
   the UI changed since the last release).
4. Add a new dated section to `changelog.md`.

## Privacy policy URL

All three stores require a privacy policy URL. Use:

> https://allyproof.com/privacy

The extension is covered by Section 13 (Browser Extension) of that
policy. The page is updated alongside extension releases — check the
"Last updated" date matches the release.
