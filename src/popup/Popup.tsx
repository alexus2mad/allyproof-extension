/**
 * The popup — the extension's primary surface in Phase 1 MVP.
 *
 * Three states:
 *   idle      — no scan run yet on this page (or page changed).
 *               Shows "Scan this page" CTA.
 *   scanning  — in flight. Spinner + page title.
 *   ready     — score, severity breakdown, top 5 violations.
 *
 * Save-to-dashboard, sign-in, and crawl come in the follow-up
 * tasks. They get wired here once the auth + endpoint work is
 * done.
 */

import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import type { ProcessedViolation, SeverityCounts } from "@allyproof/scan-core";
import { totalIssueCount } from "@allyproof/scan-core";
import { scoreColorClasses } from "@/lib/scoring";
import {
  startScanRequest,
  scanResultMessage,
  scanErrorMessage,
} from "@/lib/messages";

type ScanState =
  | { stage: "idle"; pageUrl: string | null; pageTitle: string | null }
  | { stage: "scanning"; pageUrl: string; pageTitle: string }
  | {
      stage: "ready";
      pageUrl: string;
      pageTitle: string;
      durationMs: number;
      score: number;
      counts: SeverityCounts;
      violations: ProcessedViolation[];
    }
  | { stage: "error"; pageUrl: string | null; message: string };

export function Popup() {
  const [scan, setScan] = useState<ScanState>({
    stage: "idle",
    pageUrl: null,
    pageTitle: null,
  });

  // Fetch current tab on mount.
  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      setScan({
        stage: "idle",
        pageUrl: tab?.url ?? null,
        pageTitle: tab?.title ?? null,
      });
    })();
  }, []);

  // Listen for scan results streamed from background (which
  // forwards from the content script).
  useEffect(() => {
    const listener = (raw: unknown) => {
      const result = scanResultMessage.safeParse(raw);
      if (result.success) {
        const r = result.data;
        setScan({
          stage: "ready",
          pageUrl: r.url,
          pageTitle: r.pageTitle,
          durationMs: r.durationMs,
          score: r.score,
          counts: r.counts as SeverityCounts,
          violations: r.violations as ProcessedViolation[],
        });
        return;
      }
      const err = scanErrorMessage.safeParse(raw);
      if (err.success) {
        setScan((prev) => ({
          stage: "error",
          pageUrl: "pageUrl" in prev ? prev.pageUrl : null,
          message: err.data.message,
        }));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const startScan = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id == null || !tab.url) return;
    setScan({
      stage: "scanning",
      pageUrl: tab.url,
      pageTitle: tab.title ?? tab.url,
    });
    chrome.runtime.sendMessage(
      startScanRequest.parse({ type: "scan/start", tabId: tab.id })
    );
  };

  return (
    <div className="flex min-h-[480px] flex-col gap-3 p-4">
      <Header />
      {scan.stage === "idle" && (
        <IdleView
          pageUrl={scan.pageUrl}
          pageTitle={scan.pageTitle}
          onStart={startScan}
        />
      )}
      {scan.stage === "scanning" && (
        <ScanningView pageTitle={scan.pageTitle} pageUrl={scan.pageUrl} />
      )}
      {scan.stage === "ready" && <ResultView scan={scan} onRescan={startScan} />}
      {scan.stage === "error" && (
        <ErrorView message={scan.message} onRetry={startScan} />
      )}
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-3">
      <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
      <h1 className="text-base font-semibold">AllyProof</h1>
      <span className="ml-auto text-xs text-muted-foreground">WCAG 2.2 AA</span>
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-auto pt-3 text-center text-[11px] text-muted-foreground">
      Local quick scan · axe-core 4.x · No data leaves this device
    </div>
  );
}

function isInjectableUrl(url: string | null): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

function IdleView({
  pageUrl,
  pageTitle,
  onStart,
}: {
  pageUrl: string | null;
  pageTitle: string | null;
  onStart: () => void;
}) {
  const canScan = isInjectableUrl(pageUrl);
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="text-xs text-muted-foreground">Active tab</div>
      <div className="rounded-md border border-border bg-card p-3">
        <div className="truncate text-sm font-medium" title={pageTitle ?? ""}>
          {pageTitle ?? "(no title)"}
        </div>
        <div
          className="mt-1 truncate text-xs text-muted-foreground"
          title={pageUrl ?? ""}
        >
          {pageUrl ?? "(no URL)"}
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        disabled={!canScan}
        className="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Scan this page
      </button>
      {!canScan && pageUrl && (
        <p className="text-xs text-muted-foreground">
          Browser-internal pages (chrome://, about:, the Web Store) can&apos;t
          be scanned. Open a regular site to try AllyProof.
        </p>
      )}
    </div>
  );
}

function ScanningView({
  pageTitle,
  pageUrl,
}: {
  pageTitle: string;
  pageUrl: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <div className="text-sm font-medium">Scanning…</div>
      <div className="max-w-full truncate text-xs text-muted-foreground" title={pageTitle}>
        {pageTitle}
      </div>
      <div className="max-w-full truncate text-[11px] text-muted-foreground" title={pageUrl}>
        {pageUrl}
      </div>
    </div>
  );
}

function ResultView({
  scan,
  onRescan,
}: {
  scan: Extract<ScanState, { stage: "ready" }>;
  onRescan: () => void;
}) {
  const colors = scoreColorClasses(scan.score);
  const total = totalIssueCount(scan.counts);
  const top = scan.violations
    .slice()
    .sort((a, b) => severityRank(a.impact) - severityRank(b.impact))
    .slice(0, 5);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div
        className={`rounded-lg border ${colors.border} ${colors.bg} p-4 text-center`}
      >
        <div className={`text-4xl font-bold ${colors.text}`}>{scan.score}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          out of 100 · WCAG 2.2 AA
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {total} {total === 1 ? "issue" : "issues"} · scanned in{" "}
          {(scan.durationMs / 1000).toFixed(1)}s
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <SeverityChip label="Critical" count={scan.counts.critical} severity="critical" />
        <SeverityChip label="Serious" count={scan.counts.serious} severity="serious" />
        <SeverityChip label="Moderate" count={scan.counts.moderate} severity="moderate" />
        <SeverityChip label="Minor" count={scan.counts.minor} severity="minor" />
      </div>

      {top.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top issues
          </div>
          <ul className="flex flex-col gap-2">
            {top.map((v) => (
              <ViolationRow key={v.ruleId} violation={v} />
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onRescan}
        className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        Re-scan
      </button>
    </div>
  );
}

function SeverityChip({
  label,
  count,
  severity,
}: {
  label: string;
  count: number;
  severity: "critical" | "serious" | "moderate" | "minor";
}) {
  const tone =
    severity === "critical"
      ? "text-red-600 dark:text-red-400"
      : severity === "serious"
        ? "text-orange-600 dark:text-orange-400"
        : severity === "moderate"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className={`text-lg font-semibold ${tone}`}>{count}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ViolationRow({ violation }: { violation: ProcessedViolation }) {
  const impactTone =
    violation.impact === "critical"
      ? "text-red-600 dark:text-red-400"
      : violation.impact === "serious"
        ? "text-orange-600 dark:text-orange-400"
        : violation.impact === "moderate"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";
  return (
    <li className="rounded-md border border-border bg-card p-2 text-xs">
      <div className="flex items-start gap-2">
        <span className={`mt-[2px] uppercase ${impactTone}`} aria-label={`Impact: ${violation.impact}`}>
          {violation.impact[0]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{violation.help || violation.description}</div>
          <div className="mt-1 flex items-center gap-2 text-muted-foreground">
            <span>{violation.nodes.length} {violation.nodes.length === 1 ? "node" : "nodes"}</span>
            {violation.wcagCriteria.length > 0 && (
              <span>· SC {violation.wcagCriteria.join(", ")}</span>
            )}
            {violation.helpUrl && (
              <a
                href={violation.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
              >
                Docs <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
      <AlertCircle className="h-8 w-8 text-red-600" aria-hidden />
      <div className="text-sm font-medium">Couldn&apos;t scan this page</div>
      <p className="max-w-[340px] text-xs text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        Try again
      </button>
    </div>
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
