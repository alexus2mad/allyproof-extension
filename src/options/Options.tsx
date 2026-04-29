/**
 * Settings page (chrome://extensions → Details → Extension options).
 *
 * Phase 1 MVP scope: telemetry toggle (off by default), theme,
 * API base override (for self-hosted / staging), and a "clear all
 * extension data" button.
 *
 * Sign-in / token management lands in the next task.
 */

import { useEffect, useState } from "react";
import { Trash2, ShieldCheck } from "lucide-react";
import {
  getSettings,
  setSettings,
  clearAuth,
  type ExtensionSettings,
} from "@/lib/storage";

export function Options() {
  const [settings, setLocal] = useState<ExtensionSettings | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void getSettings().then(setLocal);
  }, []);

  if (!settings) {
    return (
      <main className="mx-auto max-w-2xl p-8 text-sm">Loading…</main>
    );
  }

  const update = async (patch: Partial<ExtensionSettings>) => {
    const next = { ...settings, ...patch };
    setLocal(next);
    await setSettings(patch);
    setSavedAt(Date.now());
  };

  const wipe = async () => {
    await clearAuth();
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    setLocal({
      telemetryEnabled: false,
      theme: "system",
      apiBase: "https://allyproof.com",
    });
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
        <h1 className="text-xl font-semibold">AllyProof Settings</h1>
        {savedAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Privacy
        </h2>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.telemetryEnabled}
            onChange={(e) => update({ telemetryEnabled: e.target.checked })}
            className="mt-1"
          />
          <span className="flex-1">
            <span className="text-sm font-medium">Anonymous usage stats</span>
            <span className="block text-xs text-muted-foreground">
              Off by default. Sends extension version + scan count buckets only.
              No URLs, no DOM content, no user identifiers.
            </span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Appearance
        </h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Theme</span>
          <select
            value={settings.theme}
            onChange={(e) => update({ theme: e.target.value as ExtensionSettings["theme"] })}
            className="rounded-md border border-border bg-card px-2 py-1 text-sm"
          >
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Advanced
        </h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">API base URL</span>
          <input
            type="url"
            value={settings.apiBase}
            onChange={(e) => update({ apiBase: e.target.value })}
            className="rounded-md border border-border bg-card px-2 py-1 text-sm font-mono"
            placeholder="https://allyproof.com"
          />
          <span className="text-xs text-muted-foreground">
            Change only for self-hosted or staging environments.
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Danger zone
        </h2>
        <button
          type="button"
          onClick={() => {
            if (confirm("Clear all stored scans, settings, and auth tokens? This cannot be undone.")) {
              void wipe();
            }
          }}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Clear all extension data
        </button>
      </section>
    </main>
  );
}
