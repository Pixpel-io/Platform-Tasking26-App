import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

const LIMITS = {
  mail_account: { window: 15 * 60, max: 10 },
  mail_inbox: { window: 60, max: 60 },
  mail_read: { window: 60, max: 120 },
  mail_send: { window: 60 * 60, max: 30 },
  upload: { window: 60 * 60, max: 100 },
} as const;

export type RateLimitAction = keyof typeof LIMITS;

export async function enforceRateLimit(userId: string, action: RateLimitAction) {
  const limit = LIMITS[action];
  const { data, error } = await createServiceClient().rpc(
    "consume_request_rate_limit",
    {
      p_user_id: userId,
      p_action: action,
      p_window_seconds: limit.window,
      p_max_requests: limit.max,
    },
  );
  if (error) throw error;
  if (!data) throw new Error("Too many requests. Please try again later.");
}
