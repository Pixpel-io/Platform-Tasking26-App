import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Handles the redirect from email verification, OAuth, and password-reset
// links. Establishes a session, then forwards to `next`.
//
// Supabase sends two link shapes depending on the flow:
//   - PKCE / OAuth  → ?code=...                  (exchangeCodeForSession)
//   - Email OTP     → ?token_hash=...&type=...   (verifyOtp; e.g. recovery,
//                     signup, magiclink). Password-reset links use this one.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  let failure = "Missing authentication parameters.";

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    failure = error.message;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    failure = error.message;
  }

  console.error("[auth/callback] failed:", failure);
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(failure)}`,
  );
}
