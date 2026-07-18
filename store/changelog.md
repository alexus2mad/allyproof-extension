# Changelog (store-facing)

> One section per published version. Paste the matching block into the
> "What's new in this version" / "Release notes" field on each store
> when uploading the update. Keep entries user-facing, not internal —
> reviewers and end-users read these.

## 1.1.0 — July 2026 (consistency + deeper inspection)

- Consistent results across machines: scans now wait for the page to fully
  settle (fonts, layout) before running, and each scan records the
  environment it ran in (viewport, zoom, color scheme, language) so
  differing results are explainable
- "Needs review" section: items axe-core couldn't decide automatically are
  now listed separately for manual checking (never counted against your score)
- See every failing element per rule — highlight and inspect each one
  individually, including elements inside shadow DOM
- Severity filter chips and a toggle to show/hide best-practice rules
- Export the full scan as a JSON report
- Scan-age label so you always know how fresh the results are
- Reliability: scans can no longer get stuck on "Saving…" after a network
  drop, switching tabs mid-scan no longer mixes up results between tabs,
  and signed-in sessions survive flaky connections
- Requires Chrome 116 or newer

## 1.0.0 — May 2, 2026 (initial public release)

- One-click WCAG 2.2 AA scan of the current page (axe-core, runs locally)
- Toolbar badge shows the live violation count, color-coded by worst severity
- Side panel with the full violation list, "Show on page" highlights, and per-rule details
- Four panel modes: dock right, left, bottom, or detach as a floating window
- Optional sign-in to AllyProof for: save scans to dashboard, AI-rewritten fix code, multi-page crawl, DRAFT VPAT export
- No telemetry, no analytics, no `<all_urls>` permission
