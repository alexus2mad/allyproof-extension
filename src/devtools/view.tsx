/**
 * DevTools panel — wider canvas than the popup, with element-
 * inspector integration. Click a violation node to open it in the
 * Elements panel via chrome.devtools.inspectedWindow.eval('inspect(...)').
 *
 * Phase 2 MVP: shares the popup's data model (latest scan from
 * chrome.storage). Re-runs scan on demand via the same content-
 * script bridge. The "inspect" jump is the differentiator vs the
 * popup — agency leads who live in DevTools all day get a richer
 * surface.
 */

import { useEffect, useState } from "react";
import { ShieldCheck, ExternalLink, MousePointer2 } from "lucide-react";
import type {
  ProcessedViolation,
  SeverityCounts,
} from "@allyproof/scan-core";
import { totalIssueCount } from "@allyproof/scan-core";
import { scoreColorClasses } from "@/lib/scoring";
import { startScanRequest, scanResultMessage } from "@/lib/messages";
import { getRecentScans, type StoredScan } from "@/lib/storage";

export function PanelView() {
  const [scan, setScan] = useState<StoredScan | null>(null);

  useEffect(() => {
    void (async () => {
      const recent = await getRecentScans(1);
      const inspectedTabId = chrome.devtools?.inspectedWindow?.tabId;
      if (inspectedTabId != null) {
        const tab = await chrome.tabs.get(inspectedTabId).catch(() => null);
        if (tab?.url) {
          const match = recent.find((s) => s.url === tab.url);
          setScan(match ?? recent[0] ?? null);
          return;
        }
      }
      setScan(recent[0] ?? null);
    })();
  }, []);

  useEffect(() => {
    const listener = (raw: unknown) => {
      const result = scanResultMessage.safeParse(raw);
      if (result.success) {
        const r = result.data;
        const violations = r.violations as ProcessedViolation[];
        setScan({
          id: crypto.randomUUID(),
          url: r.url,
          pageTitle: r.pageTitle,
          scannedAt: new Date().toISOString(),
          durationMs: r.durationMs,
          score: r.score,
          counts: r.counts as SeverityCounts,
          violations,
          dashboardScanId: null,
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const rescan = async () => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    if (tabId == null) return;
    chrome.runtime.sendMessage(
      startScanRequest.parse({ type: "scan/start", tabId })
    );
  };

  const inspectNode = (selector: string) => {
    if (!selector) return;
    const safe = JSON.stringify(selector);
    chrome.devtools.inspectedWindow.eval(`inspect(document.querySelector(${safe}))`);
  };

  if (!scan) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <ShieldCheck className="h-10 w-10 text-primary" aria-hidden />
        <h1 className="text-lg font-semibold">No scan yet</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Run a scan on the inspected tab to populate this panel. Click below
          or use the toolbar popup.
        </p>
        <button
          type="button"
          onClick={() => void rescan()}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Scan inspected tab
        </button>
      </main>
    );
  }

  const colors = scoreColorClasses(scan.score);
  const total = totalIssueCount(scan.counts);

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-base font-semibold">AllyProof — DevTools panel</h1>
        </div>
        <button
          type="button"
          onClick={() => void rescan()}
          className="rounded-md border border-border bg-card px-3 py-1 text-xs font-medium hover:bg-muted"
        >
          Re-scan
        </button>
      </header>

      <section className="grid grid-cols-[auto_1fr] gap-4 rounded-lg border border-border p-4">
        <div className={`rounded-lg border ${colors.border} ${colors.bg} p-4 text-center`}>
          <div className={`text-4xl font-bold ${colors.text}`}>{scan.score}</div>
          <div className="text-xs text-muted-foreground">/ 100</div>
        </div>
        <div className="flex flex-col justify-center gap-1">
          <div className="text-sm font-medium" title={scan.pageTitle}>
            {scan.pageTitle}
          </div>
          <div className="truncate text-xs text-muted-foreground" title={scan.url}>
            {scan.url}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>
              <strong className="text-red-600 dark:text-red-400">
                {scan.counts.critical}
              </strong>{" "}
              critical
            </span>
            <span>
              <strong className="text-orange-600 dark:text-orange-400">
                {scan.counts.serious}
              </strong>{" "}
              serious
            </span>
            <span>
              <strong className="text-amber-600 dark:text-amber-400">
                {scan.counts.moderate}
              </strong>{" "}
              moderate
            </span>
            <span>
              <strong>{scan.counts.minor}</strong> minor
            </span>
            <span className="ml-auto">
              {total} {total === 1 ? "issue" : "issues"} ·{" "}
              {(scan.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          All issues
        </h2>
        <ul className="flex flex-col gap-2">
          {scan.violations
            .slice()
            .sort((a, b) => severityRank(a.impact) - severityRank(b.impact))
            .map((v) => (
              <PanelViolationRow
                key={`${v.ruleId}-${v.nodes[0]?.target?.[0] ?? ""}`}
                violation={v}
                onInspect={inspectNode}
              />
            ))}
        </ul>
      </section>
    </main>
  );
}

function PanelViolationRow({
  violation,
  onInspect,
}: {
  violation: ProcessedViolation;
  onInspect: (selector: string) => void;
}) {
  const tone =
    violation.impact === "critical"
      ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
      : violation.impact === "serious"
        ? "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
        : violation.impact === "moderate"
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
  return (
    <li className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex items-start gap-3">
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${tone}`}
        >
          {violation.impact}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{violation.help || violation.description}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {violation.ruleId} · {violation.nodes.length}{" "}
            {violation.nodes.length === 1 ? "node" : "nodes"}
            {violation.wcagCriteria.length > 0 && (
              <> · SC {violation.wcagCriteria.join(", ")}</>
            )}
          </div>
        </div>
        {violation.helpUrl && (
          <a
            href={violation.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Docs <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {violation.nodes.slice(0, 3).map((node, i) => {
          const selector = node.target?.[0] ?? "";
          return (
            <li
              key={i}
              className="flex items-center gap-2 rounded-sm bg-muted/30 p-2 text-xs"
            >
              <code
                className="min-w-0 flex-1 truncate font-mono text-[11px]"
                title={selector}
              >
                {selector || "(no selector)"}
              </code>
              {selector && (
                <button
                  type="button"
                  onClick={() => onInspect(selector)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  title="Open in Elements panel"
                >
                  <MousePointer2 className="h-3 w-3" aria-hidden />
                  Inspect
                </button>
              )}
            </li>
          );
        })}
        {violation.nodes.length > 3 && (
          <li className="text-[11px] text-muted-foreground">
            … and {violation.nodes.length - 3} more
          </li>
        )}
      </ul>
    </li>
  );
}

function severityRank(impact: ProcessedViolation["impact"]): number {
  switch (impact) {
    case "critical":
      return 0;
    case "serious":
      return 1;
    case "moderate":
      return 2;
    case "minor":
      return 3;
  }
}
