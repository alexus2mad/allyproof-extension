/**
 * Link bridge — runs only on the AllyProof origin (matched by the
 * manifest pattern). Listens for `allyproof:link-tokens` messages
 * dispatched by the /extension-link page via window.postMessage,
 * validates the payload, and forwards the tokens to the service
 * worker for storage.
 *
 * Threat model:
 *   - Only triggers on the AllyProof origin (manifest match), so
 *     a phishing site can't deliver tokens to the extension.
 *   - Validates the message shape before forwarding — discards
 *     anything that isn't the exact expected envelope.
 *   - Validates `ext_id === chrome.runtime.id` so a stale link
 *     attempt for a different (uninstalled, reinstalled, etc.)
 *     extension can't slip through.
 *   - Acks the page after forwarding so the page's UI can
 *     transition to "linked" only after the SW actually stored
 *     the tokens.
 */

import { z } from "zod";

const tokensSchema = z.object({
  access_token: z.string().min(16).startsWith("ap_ext_"),
  refresh_token: z.string().min(16).startsWith("ap_extr_"),
  access_token_prefix: z.string().max(64),
  access_expires_at: z.string(),
  refresh_expires_at: z.string(),
  token_id: z.string().uuid(),
});

const envelopeSchema = z.object({
  type: z.literal("allyproof:link-tokens"),
  ext_id: z.string(),
  return_tab_id: z.string().optional(),
  tokens: tokensSchema,
});

window.addEventListener("message", (event) => {
  // Same-origin only — postMessage event.origin matches the page
  // that sent it. The manifest match already restricts the script
  // to allyproof.com, but check anyway.
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const parsed = envelopeSchema.safeParse(event.data);
  if (!parsed.success) return;
  if (parsed.data.ext_id !== chrome.runtime.id) return;

  const { tokens } = parsed.data;
  const returnTabId = parsed.data.return_tab_id
    ? Number.parseInt(parsed.data.return_tab_id, 10)
    : undefined;
  // Forward to background. The SW handles storage + tab cleanup.
  void chrome.runtime
    .sendMessage({
      type: "auth/link",
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accessExpiresAt: tokens.access_expires_at,
        refreshExpiresAt: tokens.refresh_expires_at,
        tokenId: tokens.token_id,
      },
      returnTabId:
        returnTabId !== undefined && Number.isFinite(returnTabId) && returnTabId >= 0
          ? returnTabId
          : undefined,
    })
    .then(() => {
      // Echo back so the page can confirm the SW received it.
      // The page already shows "linked" optimistically; this is
      // just for diagnostics.
      window.postMessage(
        { type: "allyproof:link-acked" },
        window.location.origin
      );
    });
});

export {};
