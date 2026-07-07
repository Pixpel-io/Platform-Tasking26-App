import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

// Routes reachable without an authenticated session.
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/invite",
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

// Refreshes the Supabase auth cookie on every request and gates protected
// routes. Returns the response with updated cookies attached.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession) - it revalidates the token with
  // Supabase Auth and must run between client creation and any other logic.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // -- Pending-invite memory ------------------------------------------------
  // OAuth sign-in can lose the ?next=/invite/{token} chain (e.g. Supabase
  // falling back to the Site URL for brand-new users), stranding invitees on
  // onboarding. Remember the token in a cookie when a signed-out visitor
  // opens an invite, and route them back to it right after they sign in.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pendingInvite = request.cookies.get("pending_invite")?.value;

  if (!user && pathname.startsWith("/invite/")) {
    const token = pathname.split("/")[2];
    if (token && UUID_RE.test(token)) {
      response.cookies.set("pending_invite", token, {
        path: "/",
        maxAge: 3600,
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }

  if (user && pendingInvite && UUID_RE.test(pendingInvite)) {
    if (pathname.startsWith("/invite/")) {
      // They made it to an invite page - stop remembering.
      response.cookies.delete("pending_invite");
    } else if (!pathname.startsWith("/auth")) {
      const url = request.nextUrl.clone();
      url.pathname = `/invite/${pendingInvite}`;
      url.search = "";
      const redirect = NextResponse.redirect(url);
      redirect.cookies.delete("pending_invite");
      return redirect;
    }
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users shouldn't sit on auth screens.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
