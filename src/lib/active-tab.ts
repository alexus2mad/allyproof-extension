/**
 * Resolve the user's "target" tab — the page they're actually
 * looking at — across all extension surfaces.
 *
 * Why this exists:
 *   The action popup, the right-docked side panel, and a
 *   chrome.windows.create({type:"popup"}) "detached" panel all use
 *   the same React tree, but `chrome.tabs.query({active:true,
 *   currentWindow:true})` resolves differently in each:
 *     - action popup       → host browser window (correct)
 *     - side panel         → host browser window (correct)
 *     - detached popup-win → the popup window itself (WRONG — that
 *                            window has no real "active tab" for
 *                            the user's site)
 *
 * In the detached case we fall back to the most-recently-focused
 * `normal` window and pick its active tab.
 */

export async function getTargetTab(): Promise<chrome.tabs.Tab | null> {
  // Cheapest path first — works for action popup + side panel.
  // If we're in a detached popup window the result will be the
  // popup itself (not http(s)) and we'll fall through.
  const myWin = await chrome.windows.getCurrent().catch(() => null);
  if (myWin?.type === "normal") {
    const [t] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return t ?? null;
  }

  // Detached panel — find the user's actual browser.
  try {
    const win = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ["normal"],
    });
    return win.tabs?.find((t) => t.active) ?? null;
  } catch {
    return null;
  }
}
