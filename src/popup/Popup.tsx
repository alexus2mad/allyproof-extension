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
import { ShieldCheck, Loader2, AlertCircle, ExternalLink, Cloud, Check } from "lucide-react";
import type { ProcessedViolation, SeverityCounts } from "@allyproof/scan-core";
import { totalIssueCount } from "@allyproof/scan-core";
import { scoreColorClasses } from "@/lib/scoring";
import {
  startScanRequest,
  scanResultMessage,
  scanErrorMessage,
} from "@/lib/messages";
import { uploadScan, aiFix, startCrawl } from "@/lib/api";
import { getAuth, getSettings } from "@/lib/storage";
import { Sparkles, ChevronDown, ChevronUp, Copy, Crosshair } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { prettyHtml } from "@/lib/pretty-html";

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

      <SaveToDashboardCallout scan={scan} />
      <CrawlCallout scan={scan} />

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

type SaveStatus =
  | { stage: "idle" }
  | { stage: "saving" }
  | { stage: "saved"; dashboardUrl: string }
  | { stage: "error"; message: string };

function SaveToDashboardCallout({
  scan,
}: {
  scan: Extract<ScanState, { stage: "ready" }>;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [save, setSave] = useState<SaveStatus>({ stage: "idle" });

  useEffect(() => {
    void getAuth().then((a) => setAuthed(!!a));
  }, []);

  if (authed === null) return null;

  if (!authed) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
        <div className="mb-2 font-medium">Save to your AllyProof dashboard</div>
        <p className="mb-2 text-muted-foreground">
          Sign in to track this site over time, get weekly auto-scans, and
          unlock AI fix suggestions.
        </p>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const settings = await getSettings();
              const linkUrl = `${settings.apiBase.replace(/\/+$/, "")}/extension-link?ext_id=${chrome.runtime.id}`;
              await chrome.tabs.create({ url: linkUrl });
            })();
          }}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign in <ExternalLink className="h-3 w-3" aria-hidden />
        </button>
      </div>
    );
  }

  if (save.stage === "saved") {
    return (
      <button
        type="button"
        onClick={() => {
          void (async () => {
            const settings = await getSettings();
            await chrome.tabs.create({
              url: `${settings.apiBase.replace(/\/+$/, "")}${save.dashboardUrl}`,
            });
          })();
        }}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        <Check className="h-4 w-4" aria-hidden />
        Saved · Open in dashboard
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={save.stage === "saving"}
      onClick={() => {
        void (async () => {
          setSave({ stage: "saving" });
          const result = await uploadScan({
            targetUrl: scan.pageUrl,
            pageTitle: scan.pageTitle,
            durationMs: scan.durationMs,
            score: scan.score,
            counts: scan.counts,
            violations: scan.violations,
          });
          if (result.error) {
            setSave({ stage: "error", message: result.error.message });
          } else {
            setSave({ stage: "saved", dashboardUrl: result.data.dashboardUrl });
          }
        })();
      }}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {save.stage === "saving" ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Cloud className="h-4 w-4" aria-hidden />
      )}
      {save.stage === "saving"
        ? "Saving…"
        : save.stage === "error"
          ? `Retry · ${save.message}`
          : "Save to dashboard"}
    </button>
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
  const [expanded, setExpanded] = useState(false);
  const impactTone =
    violation.impact === "critical"
      ? "text-red-600 dark:text-red-400"
      : violation.impact === "serious"
        ? "text-orange-600 dark:text-orange-400"
        : violation.impact === "moderate"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";
  const firstSelector = violation.nodes[0]?.target?.[0] ?? "";
  return (
    <li className="rounded-md border border-border bg-card text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 p-2 text-left hover:bg-muted/40"
        aria-expanded={expanded}
      >
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
            <span className="ml-auto inline-flex items-center gap-2">
              {firstSelector && (
                <HighlightButton
                  selector={firstSelector}
                  label={violation.help || violation.ruleId}
                />
              )}
              {violation.helpUrl && (
                <a
                  href={violation.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Docs <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
        )}
      </button>
      {expanded && <ViolationDetail violation={violation} />}
    </li>
  );
}

function HighlightButton({
  selector,
  label,
}: {
  selector: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");

  const trigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) {
      setState("fail");
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "scan/highlight",
        selector,
        label: label?.slice(0, 80),
      });
      setState("ok");
      // Auto-close the popup so the highlight on the page is visible.
      // Without this, the popup stays open over the page and the
      // overlay is mostly hidden behind it.
      setTimeout(() => window.close(), 150);
    } catch {
      setState("fail");
    }
  };

  return (
    <button
      type="button"
      onClick={trigger}
      title="Highlight on page"
      aria-label="Highlight this element on the page"
      className={`inline-flex items-center gap-1 rounded-sm border border-border px-1 py-0.5 text-[10px] hover:bg-muted ${
        state === "fail" ? "text-red-600 dark:text-red-400" : ""
      }`}
    >
      <Crosshair className="h-3 w-3" aria-hidden />
      Show
    </button>
  );
}

type CrawlState =
  | { kind: "idle" }
  | { kind: "queueing" }
  | { kind: "queued"; scanId: string; remaining: number; dashboardUrl: string }
  | { kind: "error"; message: string };

function CrawlCallout({
  scan,
}: {
  scan: Extract<ScanState, { stage: "ready" }>;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [state, setState] = useState<CrawlState>({ kind: "idle" });

  useEffect(() => {
    void getAuth().then((a) => setAuthed(!!a));
  }, []);

  if (authed !== true) return null; // crawl is paid-tier; sign-in callout is shown above

  const trigger = async () => {
    setState({ kind: "queueing" });
    const url = new URL(scan.pageUrl);
    const result = await startCrawl({ targetUrl: `${url.protocol}//${url.hostname}` });
    if (result.error) {
      setState({ kind: "error", message: result.error.message });
    } else {
      setState({
        kind: "queued",
        scanId: result.data.scanId,
        remaining: result.data.remainingToday,
        dashboardUrl: result.data.dashboardUrl,
      });
    }
  };

  if (state.kind === "queued") {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950/40">
        <div className="mb-1 font-medium text-emerald-700 dark:text-emerald-300">
          Crawl queued
        </div>
        <p className="mb-2 text-muted-foreground">
          Multi-page scan running on AllyProof&apos;s servers. {state.remaining}{" "}
          ad-hoc scans left today.
        </p>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const settings = await getSettings();
              await chrome.tabs.create({
                url: `${settings.apiBase.replace(/\/+$/, "")}${state.dashboardUrl}`,
              });
            })();
          }}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-card px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-muted dark:border-emerald-800 dark:text-emerald-400"
        >
          Track progress in dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs">
      <div className="mb-1 font-medium">Scan the whole site</div>
      <p className="mb-2 text-muted-foreground">
        Run a multi-page crawl on AllyProof&apos;s servers — full Playwright
        engine, three-engine consensus.
      </p>
      <button
        type="button"
        disabled={state.kind === "queueing"}
        onClick={() => void trigger()}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {state.kind === "queueing" ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Queueing…
          </>
        ) : (
          "Crawl this site"
        )}
      </button>
      {state.kind === "error" && (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
    </div>
  );
}

type AiState =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "ready"; markdown: string; modelKey: string }
  | { stage: "error"; message: string }
  | { stage: "auth-required" };

function ViolationDetail({ violation }: { violation: ProcessedViolation }) {
  const [ai, setAi] = useState<AiState>({ stage: "idle" });
  const node = violation.nodes[0];

  const generate = async () => {
    setAi({ stage: "loading" });
    const auth = await getAuth();
    if (!auth) {
      setAi({ stage: "auth-required" });
      return;
    }
    const result = await aiFix({
      ruleId: violation.ruleId,
      impact: violation.impact,
      description: violation.description,
      helpUrl: violation.helpUrl,
      wcagCriteria: violation.wcagCriteria,
      element: {
        html: node?.html ?? "",
        selector: node?.target?.[0] ?? "",
        failureSummary: node?.failureSummary ?? "",
      },
    });
    if (result.error) {
      setAi({ stage: "error", message: result.error.message });
    } else {
      setAi({
        stage: "ready",
        markdown: result.data.suggestion,
        modelKey: result.data.modelKey,
      });
    }
  };

  return (
    <div className="border-t border-border bg-muted/20 p-2">
      {node?.html && (
        <details className="mb-2">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">
            Failing HTML
          </summary>
          <pre className="mt-1 whitespace-pre-wrap break-all rounded-sm bg-background p-2 font-mono text-[10px] leading-snug">
            <code>{prettyHtml(node.html)}</code>
          </pre>
        </details>
      )}
      {ai.stage === "idle" && (
        <button
          type="button"
          onClick={() => void generate()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Sparkles className="h-3 w-3" aria-hidden /> Generate AI fix
        </button>
      )}
      {ai.stage === "loading" && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Generating fix…
        </div>
      )}
      {ai.stage === "auth-required" && (
        <p className="text-[11px] text-muted-foreground">
          Sign in to your AllyProof dashboard to use AI fix suggestions.
        </p>
      )}
      {ai.stage === "error" && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-red-600 dark:text-red-400">{ai.message}</p>
          <button
            type="button"
            onClick={() => void generate()}
            className="w-fit rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted"
          >
            Retry
          </button>
        </div>
      )}
      {ai.stage === "ready" && (
        <div className="flex flex-col gap-2">
          <div className="rounded-sm bg-background p-2 text-[11px] leading-relaxed">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="my-1.5">{children}</p>,
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                em: ({ children }) => <em className="italic">{children}</em>,
                ul: ({ children }) => (
                  <ul className="my-1 ml-4 list-disc">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-1 ml-4 list-decimal">{children}</ol>
                ),
                li: ({ children }) => <li className="my-0.5">{children}</li>,
                h1: ({ children }) => (
                  <h3 className="mt-2 mb-1 text-xs font-semibold">{children}</h3>
                ),
                h2: ({ children }) => (
                  <h3 className="mt-2 mb-1 text-xs font-semibold">{children}</h3>
                ),
                h3: ({ children }) => (
                  <h3 className="mt-2 mb-1 text-xs font-semibold">{children}</h3>
                ),
                code: ({ className, children, ...props }) => {
                  // Block vs inline: react-markdown adds a
                  // language-* className on block code; inline has none.
                  const isBlock = /language-/.test(className ?? "");
                  if (isBlock) {
                    // Pretty-print HTML so long opening tags wrap
                    // onto multiple lines naturally — kills the
                    // horizontal scroll that made the drawer
                    // unreadable on a 400 px popup.
                    const text = String(children).replace(/\n$/, "");
                    const isHtml = /language-html/.test(className ?? "");
                    const formatted = isHtml ? prettyHtml(text) : text;
                    return (
                      <code className={`block ${className ?? ""}`} {...props}>
                        {formatted}
                      </code>
                    );
                  }
                  return (
                    <code
                      className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px]"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="my-1.5 whitespace-pre-wrap break-all rounded-sm bg-muted p-2 font-mono text-[10px] leading-snug">
                    {children}
                  </pre>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {ai.markdown}
            </ReactMarkdown>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(ai.markdown)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted"
            >
              <Copy className="h-3 w-3" aria-hidden /> Copy
            </button>
            <span className="text-[10px] text-muted-foreground">
              {ai.modelKey}
            </span>
          </div>
        </div>
      )}
    </div>
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
