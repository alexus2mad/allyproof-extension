/**
 * Live auth-state hook.
 *
 * Reads the current AuthState from chrome.storage.session AND
 * subscribes to chrome.storage.onChanged so any surface that
 * depends on sign-in status (popup, side panel, options page)
 * re-renders the moment tokens land — instead of needing a
 * manual reload.
 *
 * The link bridge writes new tokens to chrome.storage.session
 * via background → setAuth(); that change fires onChanged, the
 * listener here updates state, and React re-renders. Same hook
 * also catches sign-out (clearAuth → onChanged with newValue
 * undefined).
 */

import { useEffect, useState } from "react";
import { getAuth, type AuthState } from "@/lib/storage";

export function useAuth(): {
  auth: AuthState | null;
  loading: boolean;
} {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void getAuth().then((a) => {
      if (cancelled) return;
      setAuth(a);
      setLoading(false);
    });

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: chrome.storage.AreaName
    ) => {
      // setAuth writes to chrome.storage.session under the
      // "auth" key. clearAuth removes it. Either way, the
      // session-area onChanged carries the new value (or
      // undefined for removal).
      if (area === "session" && "auth" in changes) {
        const next = changes["auth"]!.newValue as AuthState | null | undefined;
        setAuth(next ?? null);
      }
    };
    chrome.storage.onChanged.addListener(listener);

    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  return { auth, loading };
}
