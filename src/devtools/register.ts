/**
 * DevTools registration page — invisible, only registers the panel.
 * Chrome doesn't render this page; it just needs to exist so it can
 * call chrome.devtools.panels.create.
 */

chrome.devtools.panels.create(
  "AllyProof",
  "src/assets/icon-32.png",
  "src/devtools/panel.html"
);
