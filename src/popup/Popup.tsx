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
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  ExternalLink,
  Cloud,
  Check,
  PanelRight,
  PanelLeft,
  PanelBottom,
  PictureInPicture2,
  ListChecks,
} from "lucide-react";
import type { ProcessedViolation, SeverityCounts } from "@allyproof/scan-core";
import { totalIssueCount } from "@allyproof/scan-core";
import { scoreColorClasses } from "@/lib/scoring";
import {
  startScanRequest,
  scanResultMessage,
  scanErrorMessage,
  openDetachedPanelRequest,
  closeDetachedPanelRequest,
} from "@/lib/messages";
import { uploadScan, aiFix, startCrawl } from "@/lib/api";
import {
  getAuth,
  getSettings,
  setSettings,
  getRecentScans,
  type DockMode,
} from "@/lib/storage";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles, ChevronDown, ChevronUp, Copy, Crosshair } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { prettyHtml } from "@/lib/pretty-html";
import { getTargetTab } from "@/lib/active-tab";

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

/**
 * Surface detection — the same React tree mounts in three places:
 *   1. action popup (src/popup/index.html)         → /popup/
 *   2. native side panel (src/sidepanel/index.html) → /sidepanel/
 *   3. detached popup window (also sidepanel HTML)  → /sidepanel/
 *
 * Pathname distinguishes the action popup from the panel surfaces.
 * To tell apart side-panel vs detached popup-window we check
 * chrome.windows.getCurrent().type — only known asynchronously, so
 * the panel surface defaults to "panel" and refines once known.
 */
function isPanelSurface(): boolean {
  return /\/sidepanel\//.test(window.location.pathname);
}

/**
 * window.screen.availLeft/availTop are non-standard (multi-monitor
 * extensions) and missing from the lib.dom Screen type. They're
 * implemented in Chromium and meaningful for positioning a popup
 * window on the correct display, so we read them defensively.
 */
function readScreenBounds(): {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
} {
  const s = window.screen as Screen & {
    availLeft?: number;
    availTop?: number;
  };
  return {
    availLeft: typeof s.availLeft === "number" ? s.availLeft : 0,
    availTop: typeof s.availTop === "number" ? s.availTop : 0,
    availWidth: s.availWidth,
    availHeight: s.availHeight,
  };
}

type SurfaceKind = "popup" | "panel-right" | "panel-detached";

function useSurfaceKind(): SurfaceKind {
  const [kind, setKind] = useState<SurfaceKind>(
    isPanelSurface() ? "panel-right" : "popup"
  );
  useEffect(() => {
    if (!isPanelSurface()) return;
    void (async () => {
      try {
        const win = await chrome.windows.getCurrent();
        // type "popup" = chrome.windows.create({type:"popup"}) i.e.
        // our left/bottom/detached surface. type "normal" = the host
        // browser window the side panel is docked to.
        setKind(win.type === "popup" ? "panel-detached" : "panel-right");
      } catch {
        /* keep default */
      }
    })();
  }, []);
  return kind;
}

export function Popup() {
  const [scan, setScan] = useState<ScanState>({
    stage: "idle",
    pageUrl: null,
    pageTitle: null,
  });
  const surface = useSurfaceKind();

  // Hydrate from storage on mount AND whenever the user changes
  // tabs / the active tab finishes navigating. The action popup
  // remounts on every open so it sees fresh state for free; the
  // panel surfaces (right side panel, detached popup window) live
  // across tab switches and need explicit re-hydration — otherwise
  // the panel keeps showing the previous tab's scan after the user
  // moves to a different page.
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const tab = await getTargetTab();
      if (cancelled) return;
      const url = tab?.url ?? null;
      const title = tab?.title ?? null;

      if (url) {
        const recent = await getRecentScans(20);
        if (cancelled) return;
        const match = recent.find((s) => s.url === url);
        if (match) {
          setScan({
            stage: "ready",
            pageUrl: match.url,
            pageTitle: match.pageTitle,
            durationMs: match.durationMs,
            score: match.score,
            counts: match.counts,
            violations: match.violations,
          });
          return;
        }
      }

      setScan({
        stage: "idle",
        pageUrl: url,
        pageTitle: title,
      });
    };
    void hydrate();

    // onActivated — user clicked a different tab in the strip.
    const onActivated = () => void hydrate();
    // onUpdated — page navigated (URL change) or finished loading.
    // Filter to those two signals; raw "loading" events fire too
    // often and would needlessly churn through hydrate. The url
    // field on info is only populated when the URL itself changed.
    const onUpdated = (
      _tabId: number,
      info: chrome.tabs.TabChangeInfo
    ) => {
      if (info.url || info.status === "complete") void hydrate();
    };
    // onFocusChanged — user switched browser windows. Relevant in
    // detached panel-window mode where the user's "real" tab lives
    // in a different window than the panel.
    const onFocusChanged = (windowId: number) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) return;
      void hydrate();
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows?.onFocusChanged?.addListener(onFocusChanged);
    return () => {
      cancelled = true;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows?.onFocusChanged?.removeListener(onFocusChanged);
    };
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
    const tab = await getTargetTab();
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
      <Header surface={surface} />
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
      {scan.stage === "ready" && (
        <ResultView scan={scan} surface={surface} onRescan={startScan} />
      )}
      {scan.stage === "error" && (
        <ErrorView message={scan.message} onRetry={startScan} />
      )}
      <Footer />
    </div>
  );
}

function Header({ surface }: { surface: SurfaceKind }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-3">
      <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
      <h1 className="text-base font-semibold">AllyProof</h1>
      {surface !== "popup" ? (
        <DockModeSwitcher className="ml-auto" />
      ) : (
        <span className="ml-auto text-xs text-muted-foreground">
          WCAG 2.2 AA
        </span>
      )}
    </div>
  );
}

const DOCK_OPTIONS: ReadonlyArray<{
  mode: DockMode;
  label: string;
  Icon: typeof PanelRight;
}> = [
  { mode: "right", label: "Dock right", Icon: PanelRight },
  { mode: "left", label: "Dock left", Icon: PanelLeft },
  { mode: "bottom", label: "Dock bottom", Icon: PanelBottom },
  { mode: "detached", label: "Detach window", Icon: PictureInPicture2 },
];

/**
 * Firefox MV3 doesn't implement chrome.sidePanel. The "right" dock
 * mode wraps that API, so on Firefox we must hide the option and
 * silently coerce a stored "right" preference (e.g. profile synced
 * over from a Chrome install) to "detached".
 */
function isSidePanelSupported(): boolean {
  return typeof chrome.sidePanel !== "undefined";
}

function DockModeSwitcher({ className }: { className?: string }) {
  const [current, setCurrent] = useState<DockMode | null>(null);
  // Guard against rapid double-clicks producing concurrent
  // setOptions / windows.create calls. Without this, two near-
  // simultaneous mode switches can race the panel-window tracker
  // and leave the user with two stacked panel windows.
  const [switching, setSwitching] = useState(false);

  // Lazy-read on mount; don't render anything until we know the
  // current mode so the active state is honest.
  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      const effective = !isSidePanelSupported() && s.dockMode === "right"
        ? "detached"
        : s.dockMode;
      setCurrent(effective);
    })();
  }, []);

  const options = isSidePanelSupported()
    ? DOCK_OPTIONS
    : DOCK_OPTIONS.filter((o) => o.mode !== "right");

  const switchTo = async (next: DockMode) => {
    if (next === current || switching) return;
    setSwitching(true);
    try {
    await setSettings({ dockMode: next });
    setCurrent(next);

    if (next === "right") {
      // Need a normal browser window to dock the side panel onto.
      // From a detached popup window, getCurrent() returns the
      // popup itself — fall back to the user's last-focused
      // browser window. From the right-dock case the user is
      // already there, so getCurrent() returns the host.
      let hostWinId: number | undefined;
      try {
        const cur = await chrome.windows.getCurrent();
        if (cur.type === "normal" && cur.id != null) {
          hostWinId = cur.id;
        } else {
          const last = await chrome.windows.getLastFocused({
            windowTypes: ["normal"],
          });
          hostWinId = last.id ?? undefined;
        }
      } catch {
        /* no window — bail */
      }
      if (hostWinId == null) return;
      try {
        await chrome.sidePanel.setOptions({
          path: "src/sidepanel/index.html",
          enabled: true,
        });
        await chrome.sidePanel.open({ windowId: hostWinId });
      } catch {
        /* unsupported / denied — leave detached open as fallback */
        return;
      }
      // Close any detached panel window. The current surface may
      // *be* that window — closing it is fine; the side panel is
      // already open at this point.
      chrome.runtime.sendMessage(
        closeDetachedPanelRequest.parse({ type: "panel/closeDetached" })
      );
      return;
    }

    // left / bottom / detached — handed off to the background. The
    // service worker positions the popup window using the screen
    // dims we measure here (background has no DOM).
    chrome.runtime.sendMessage(
      openDetachedPanelRequest.parse({
        type: "panel/openDetached",
        mode: next,
        screen: readScreenBounds(),
      })
    );
    // If we're switching from right-dock, hide the side panel so
    // the user doesn't end up with both surfaces visible.
    if (current === "right" && isSidePanelSupported()) {
      try {
        await chrome.sidePanel.setOptions({ enabled: false });
      } catch {
        /* no-op */
      }
    }
    } finally {
      setSwitching(false);
    }
  };

  if (current == null) return null;

  return (
    <div
      role="group"
      aria-label="Panel position"
      className={`inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 ${className ?? ""}`}
    >
      {options.map(({ mode, label, Icon }) => {
        const active = mode === current;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => void switchTo(mode)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

function Footer() {
  // The "no data leaves" line is only true while the user is signed
  // out. Once authed, save-to-dashboard, AI fix, and crawl all send
  // data to AllyProof — keeping the original copy would be misleading
  // to the user (and to a Chrome reviewer doing privacy audit).
  const { auth, loading } = useAuth();
  if (loading) return null;
  return (
    <div className="mt-auto pt-3 text-center text-[11px] text-muted-foreground">
      {auth
        ? "axe-core · synced to AllyProof when you save, fix, or crawl"
        : "Local quick scan · axe-core · No data leaves this device"}
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
  surface,
  onRescan,
}: {
  scan: Extract<ScanState, { stage: "ready" }>;
  surface: SurfaceKind;
  onRescan: () => void;
}) {
  const colors = scoreColorClasses(scan.score);
  const total = totalIssueCount(scan.counts);
  const isPanel = surface !== "popup";
  // Panel surfaces have room for the full list; the action popup
  // is space-constrained and now hands off to the panel via the
  // "Show all" button below.
  const violations = scan.violations
    .slice()
    .sort((a, b) => severityRank(a.impact) - severityRank(b.impact));

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

      {!isPanel && total > 0 && <ShowAllInPanelButton total={total} />}

      {isPanel && violations.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            All issues ({violations.length})
          </div>
          <ul className="flex flex-col gap-2">
            {violations.map((v) => (
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

/**
 * In the action popup, this is the only entry point into the full
 * violations list. It opens whichever dock mode the user picked
 * (right-dock natively; left/bottom/detached via background-spawned
 * popup window) and then closes the action popup so the page is
 * unobscured.
 */
function ShowAllInPanelButton({ total }: { total: number }) {
  const open = async () => {
    const settings = await getSettings();
    // Coerce a stale "right" preference to "detached" on browsers
    // without chrome.sidePanel (Firefox MV3). Without this, clicking
    // "Show all issues" on Firefox would silently close the popup
    // and never open any panel — confusing dead-end UX.
    const mode =
      settings.dockMode === "right" && !isSidePanelSupported()
        ? "detached"
        : settings.dockMode;

    if (mode === "right") {
      // chrome.sidePanel.open() requires a user gesture and must be
      // invoked from the same context as the click — so it lives
      // here, not in the background.
      const tab = await getTargetTab();
      const winId = tab?.windowId;
      if (winId == null) return;
      try {
        await chrome.sidePanel.setOptions({
          path: "src/sidepanel/index.html",
          enabled: true,
        });
        await chrome.sidePanel.open({ windowId: winId });
      } catch {
        /* unsupported / denied */
      }
    } else {
      chrome.runtime.sendMessage(
        openDetachedPanelRequest.parse({
          type: "panel/openDetached",
          mode,
          screen: readScreenBounds(),
        })
      );
    }

    // Give the panel surface a beat to mount before the action
    // popup tears itself down — closes feel snappier this way.
    setTimeout(() => window.close(), 200);
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
    >
      <ListChecks className="h-4 w-4" aria-hidden />
      Show all {total} {total === 1 ? "issue" : "issues"}
    </button>
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
  const { auth, loading } = useAuth();
  const [save, setSave] = useState<SaveStatus>({ stage: "idle" });

  // Reset the saved state when auth changes (e.g. user just
  // signed in mid-session). Otherwise a stale "Saved" pill could
  // hang around from a previous scan upload.
  useEffect(() => {
    setSave({ stage: "idle" });
  }, [auth?.tokenId]);

  if (loading) return null;

  if (!auth) {
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
              // Capture the source tab so the background can refocus
              // it after the link succeeds. From the side panel
              // context this is the tab the user was viewing when
              // they clicked Sign in; from the popup it's the same.
              const sourceTab = await getTargetTab();
              const params = new URLSearchParams({
                ext_id: chrome.runtime.id,
              });
              if (sourceTab?.id != null) {
                params.set("return_tab_id", String(sourceTab.id));
              }
              const linkUrl = `${settings.apiBase.replace(/\/+$/, "")}/extension-link?${params.toString()}`;
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

function ViolationRow({
  violation,
}: {
  violation: ProcessedViolation;
}) {
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

/**
 * The Popup component is mounted in TWO surfaces:
 *   - chrome.action popup (src/popup/index.html)
 *   - chrome.sidePanel    (src/sidepanel/index.html)
 *
 * They share UI but the Show flow differs:
 *   - From the popup: open the side panel, then close the popup
 *     so the page is unobscured.
 *   - From the side panel: just send the highlight — closing
 *     the side panel would defeat the whole point.
 *
 * window.location.pathname is the cleanest way to tell them
 * apart at runtime; both files set up identical roots so the
 * component is otherwise context-agnostic.
 */
function isInSidePanel(): boolean {
  return /\/sidepanel\//.test(window.location.pathname);
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
    const tab = await getTargetTab();
    if (tab?.id == null || tab.windowId == null) {
      setState("fail");
      setTimeout(() => setState("idle"), 1500);
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "scan/highlight",
        selector,
        label: label?.slice(0, 80),
      });

      setState("ok");

      if (isInSidePanel()) {
        // Already docked — flash and stay put.
        setTimeout(() => setState("idle"), 1200);
        return;
      }

      // Popup context: open the side panel so results remain
      // visible alongside the page, then close the popup.
      // Requires Chrome 116+; older builds fall through to
      // popup-close-only with state persistence catching the
      // next reopen.
      if (chrome.sidePanel?.open) {
        await chrome.sidePanel
          .open({ windowId: tab.windowId })
          .catch(() => {
            /* user denied / unsupported — popup still closes */
          });
      }
      setTimeout(() => window.close(), 250);
    } catch {
      setState("fail");
      setTimeout(() => setState("idle"), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={trigger}
      title="Highlight on page"
      aria-label="Highlight this element on the page"
      className={`inline-flex items-center gap-1 rounded-sm border px-1 py-0.5 text-[10px] hover:bg-muted ${
        state === "fail"
          ? "border-red-300 text-red-600 dark:border-red-800 dark:text-red-400"
          : state === "ok"
            ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
            : "border-border"
      }`}
    >
      <Crosshair className="h-3 w-3" aria-hidden />
      {state === "ok" ? "On page" : state === "fail" ? "Failed" : "Show"}
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
  const { auth, loading } = useAuth();
  const [state, setState] = useState<CrawlState>({ kind: "idle" });

  // Drop any stale crawl state when the user re-authes (e.g.
  // after switching orgs by re-linking).
  useEffect(() => {
    setState({ kind: "idle" });
  }, [auth?.tokenId]);

  if (loading || !auth) return null; // crawl is paid-tier; sign-in callout is shown above

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
