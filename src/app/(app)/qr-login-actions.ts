"use server";

// QR sign-in for your own phone: mints a one-time magic-link token for the
// CURRENTLY signed-in user (whatever provider they used - Google, Microsoft
// or email) and returns a URL the phone can open to get the same session.
// The token is single-use and expires quickly; nothing is emailed.

import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import {
  createServiceClient,
  serviceRoleEnabled,
} from "@/lib/supabase/service";

async function siteOrigin() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function createQrLoginUrl(): Promise<
  { url: string } | { error: string }
> {
  const user = await requireUser();
  if (!user.email) {
    return { error: "Your account has no email address." };
  }
  if (!serviceRoleEnabled()) {
    return { error: "QR sign-in isn't configured on this server." };
  }

  const admin = createServiceClient();
  // generateLink creates the OTP without sending any email. The hashed token
  // works with verifyOtp on the phone regardless of the account's original
  // sign-in provider.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  if (error || !data?.properties?.hashed_token) {
    return { error: error?.message ?? "Could not create a sign-in link." };
  }

  const origin = await siteOrigin();
  const url = `${origin}/auth/callback?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=magiclink&next=/`;

  return { url };
}
