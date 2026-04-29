/**
 * AllyProof platform API client. Lives in the service worker (and,
 * for endpoints the popup needs to hit directly, in the popup
 * itself). Centralises error normalisation and token refresh.
 *
 * Auth model:
 *   - Every authenticated call sends the access token in the
 *     `x-extension-token` header.
 *   - On a 401, the client tries the refresh endpoint once; if
 *     that succeeds, it replays the original request. Two
 *     consecutive 401s force the user to re-link.
 */

import { z } from "zod";
import {
  getAuth,
  setAuth,
  clearAuth,
  getStoredRefreshToken,
  getSettings,
  type AuthState,
} from "@/lib/storage";

const refreshResponse = z.object({
  data: z
    .object({
      access_token: z.string(),
      refresh_token: z.string(),
      access_token_prefix: z.string(),
      access_expires_at: z.string(),
      refresh_expires_at: z.string(),
      token_id: z.string(),
    })
    .nullable(),
  error: z.unknown().nullable(),
});

async function apiBase(): Promise<string> {
  const s = await getSettings();
  return s.apiBase.replace(/\/+$/, "");
}

async function refreshAuth(): Promise<AuthState | null> {
  const stored = await getStoredRefreshToken();
  if (!stored) return null;

  const base = await apiBase();
  const res = await fetch(`${base}/api/extensions/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: stored.refreshToken }),
  });
  if (!res.ok) {
    await clearAuth();
    return null;
  }
  const parsed = refreshResponse.parse(await res.json());
  if (!parsed.data) {
    await clearAuth();
    return null;
  }
  const next: AuthState = {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    accessExpiresAt: parsed.data.access_expires_at,
    refreshExpiresAt: parsed.data.refresh_expires_at,
    tokenId: parsed.data.token_id,
  };
  await setAuth(next);
  return next;
}

interface ApiSuccess<T> {
  data: T;
  error: null;
}
interface ApiFailure {
  data: null;
  error: { message: string; code: string; status: number };
}
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

async function authedRequest<T>(
  path: string,
  init: RequestInit,
  validator: (raw: unknown) => T,
  isRetry = false
): Promise<ApiResult<T>> {
  const auth = await getAuth();
  if (!auth) {
    if (!isRetry) {
      const refreshed = await refreshAuth();
      if (refreshed) return authedRequest(path, init, validator, true);
    }
    return {
      data: null,
      error: { message: "Not signed in", code: "unauthenticated", status: 401 },
    };
  }

  const base = await apiBase();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "Content-Type": "application/json",
      "x-extension-token": auth.accessToken,
    },
  });

  if (res.status === 401 && !isRetry) {
    const refreshed = await refreshAuth();
    if (refreshed) return authedRequest(path, init, validator, true);
    await clearAuth();
    return {
      data: null,
      error: {
        message: "Session expired — sign in again",
        code: "unauthenticated",
        status: 401,
      },
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* body might be empty on some errors */
  }

  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `Request failed (${res.status})`;
    const code =
      (body as { error?: { code?: string } } | null)?.error?.code ?? "request_failed";
    return { data: null, error: { message, code, status: res.status } };
  }

  try {
    return { data: validator(body), error: null };
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : "Invalid response",
        code: "invalid_response",
        status: res.status,
      },
    };
  }
}

// ── Crawl (ad-hoc) ────────────────────────────────────────────────

const crawlResponse = z.object({
  data: z.object({
    scan_id: z.string().uuid(),
    status: z.string(),
    max_pages: z.number().int(),
    remaining_today: z.number().int(),
    dashboard_url: z.string(),
  }),
  error: z.null(),
});

export interface CrawlInput {
  targetUrl: string;
  maxPages?: number;
}

export async function startCrawl(
  input: CrawlInput
): Promise<
  ApiResult<{
    scanId: string;
    status: string;
    maxPages: number;
    remainingToday: number;
    dashboardUrl: string;
  }>
> {
  const result = await authedRequest(
    "/api/extensions/scans/crawl",
    {
      method: "POST",
      body: JSON.stringify({
        target_url: input.targetUrl,
        max_pages: input.maxPages,
      }),
    },
    (raw) => crawlResponse.parse(raw).data
  );
  if (result.error) return result;
  return {
    data: {
      scanId: result.data.scan_id,
      status: result.data.status,
      maxPages: result.data.max_pages,
      remainingToday: result.data.remaining_today,
      dashboardUrl: result.data.dashboard_url,
    },
    error: null,
  };
}

// ── Save-to-dashboard ─────────────────────────────────────────────

const uploadResponse = z.object({
  data: z.object({
    scan_id: z.string().uuid(),
    dashboard_url: z.string(),
    score: z.number(),
  }),
  error: z.null(),
});

export interface UploadScanInput {
  targetUrl: string;
  pageTitle: string;
  durationMs: number;
  score: number;
  counts: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  violations: unknown[];
}

// ── AI fix ────────────────────────────────────────────────────────

const aiFixResponse = z.object({
  data: z.object({
    suggestion: z.string(),
    model_key: z.string(),
  }),
  error: z.null(),
});

export interface AiFixInput {
  ruleId: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  helpUrl: string;
  wcagCriteria: string[];
  element: {
    html: string;
    selector: string;
    failureSummary: string;
  };
}

export async function aiFix(
  input: AiFixInput
): Promise<ApiResult<{ suggestion: string; modelKey: string }>> {
  const result = await authedRequest(
    "/api/extensions/ai/fix",
    {
      method: "POST",
      body: JSON.stringify({
        rule_id: input.ruleId,
        impact: input.impact,
        description: input.description,
        help_url: input.helpUrl,
        wcag_criteria: input.wcagCriteria,
        element: {
          html: input.element.html,
          selector: input.element.selector,
          failure_summary: input.element.failureSummary,
        },
      }),
    },
    (raw) => aiFixResponse.parse(raw).data
  );
  if (result.error) return result;
  return {
    data: { suggestion: result.data.suggestion, modelKey: result.data.model_key },
    error: null,
  };
}

export async function uploadScan(
  input: UploadScanInput
): Promise<ApiResult<{ scanId: string; dashboardUrl: string }>> {
  const result = await authedRequest(
    "/api/extensions/scans/upload",
    {
      method: "POST",
      body: JSON.stringify({
        target_url: input.targetUrl,
        page_title: input.pageTitle,
        duration_ms: input.durationMs,
        score: input.score,
        counts: input.counts,
        violations: input.violations,
      }),
    },
    (raw) => uploadResponse.parse(raw).data
  );
  if (result.error) return result;
  return {
    data: { scanId: result.data.scan_id, dashboardUrl: result.data.dashboard_url },
    error: null,
  };
}
