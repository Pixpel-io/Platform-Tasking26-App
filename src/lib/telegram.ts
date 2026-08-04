// =============================================================================
// Telegram Bot API client - server only.
//
// We deliberately keep this file tiny and dependency-free (native fetch) so
// route handlers can import it without pulling extra bundle weight. All calls
// require TELEGRAM_BOT_TOKEN in the environment; if it's missing every helper
// throws so a mis-configured deploy fails loudly instead of silently dropping
// notifications.
// =============================================================================

const API_ROOT = "https://api.telegram.org";

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return token;
}

// Telegram accepts a limited HTML subset. Anything else we pass through must be
// escaped or the API returns 400 with "can't parse entities".
export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type TelegramSendMessage = {
  chatId: string;
  text: string;
  // Optional inline URL button - typically "Open in Tasking" that deep-links to
  // the relevant page in the app.
  action?: { label: string; url: string };
};

// Fire a message at a chat. Returns the API response for logging; throws on
// non-2xx so the caller can decide whether to retry / disable the channel.
export async function sendTelegramMessage(
  message: TelegramSendMessage,
): Promise<unknown> {
  const payload: Record<string, unknown> = {
    chat_id: message.chatId,
    text: message.text,
    parse_mode: "HTML",
    // Link previews would clutter every mention with a big preview card.
    link_preview_options: { is_disabled: true },
  };
  if (message.action) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: message.action.label, url: message.action.url }]],
    };
  }

  const res = await fetch(`${API_ROOT}/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    error_code?: number;
  };
  if (!res.ok || !json.ok) {
    // Bubble the Telegram error_code up so the fanout endpoint can react to
    // "Forbidden: bot was blocked by the user" (403) by disabling the channel.
    const err = new Error(
      `Telegram sendMessage failed: ${json.description ?? res.statusText}`,
    ) as Error & { status?: number; telegramCode?: number };
    err.status = res.status;
    err.telegramCode = json.error_code;
    throw err;
  }
  return json;
}

// Point Telegram at our webhook so it delivers /start updates. Call once during
// deployment (or run the setup script) - Telegram remembers the URL until we
// change it. The secret_token is echoed back in the X-Telegram-Bot-Api-Secret-
// Token header so our webhook route can reject spoofed requests.
export async function setTelegramWebhook(
  url: string,
  secret: string,
): Promise<unknown> {
  const res = await fetch(`${API_ROOT}/bot${botToken()}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Telegram setWebhook failed: ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return json;
}

// Convenience for the connect flow: a short, unambiguous code the user pastes
// into `/start`. Base32 alphabet (no vowels, no confusables like 0/O/1/I).
const CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXYZ23456789";
export function generateLinkCode(length = 10): string {
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[array[i] % CODE_ALPHABET.length];
  }
  return out;
}
