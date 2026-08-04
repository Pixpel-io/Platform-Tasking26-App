import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed `middleware` to `proxy` (Node.js runtime, not edge).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except static assets and image optimization.
    // API handlers authenticate and rate-limit their own requests. Skipping
    // the proxy avoids a second Supabase getUser() network round-trip on every
    // mail action. Static install assets do not need session refresh either.
    "/((?!api/|landing-page|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|apk|webmanifest)$).*)",
  ],
};
