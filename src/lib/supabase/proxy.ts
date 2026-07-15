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
  "/dm-invite",
  "/qr",
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
  //
  // This call hits Supabase Auth over the network. After the tab has been
  // idle (laptop asleep, tab backgrounded), the first navigation fires this
  // while the connection is cold - a transient DNS/socket failure here would
  // throw out of the proxy and hand the browser a dead response ("This page
  // couldn't load"). Swallow the network error and let the request proceed
  // with whatever cookies it already has; the page's own requireUser() guard
  // still redirects to /login if the session is genuinely gone. We only act
  // on `user` when the lookup actually succeeded.
  let user: Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"] = null;
  let authResolved = false;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authResolved = !result.error;
  } catch {
    // Network hiccup on a cold connection - don't crash the proxy.
    return response;
  }

  const { pathname } = request.nextUrl;

  // -- Pending-invite memory ------------------------------------------------
  // OAuth sign-in can lose the ?next=/invite/{token} chain (e.g. Supabase
  // falling back to the Site URL for brand-new users), stranding invitees on
  // onboarding. Remember the token in a cookie when a signed-out visitor
  // opens an invite, and route them back to it right after they sign in.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pendingInvite = request.cookies.get("pending_invite")?.value;

  if (!user && (pathname.startsWith("/invite/") || pathname.startsWith("/dm-invite/"))) {
    const isDm = pathname.startsWith("/dm-invite/");
    const token = pathname.split("/")[2];
    if (token && UUID_RE.test(token)) {
      response.cookies.set("pending_invite", isDm ? `dm:${token}` : token, {
        path: "/",
        maxAge: 3600,
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }

  if (user && pendingInvite) {
    const isDm = pendingInvite.startsWith("dm:");
    const token = isDm ? pendingInvite.slice(3) : pendingInvite;
    if (UUID_RE.test(token)) {
      if (pathname.startsWith("/invite/") || pathname.startsWith("/dm-invite/")) {
        // They made it to an invite page - stop remembering.
        response.cookies.delete("pending_invite");
      } else if (!pathname.startsWith("/auth")) {
        const url = request.nextUrl.clone();
        url.pathname = isDm ? `/dm-invite/${token}` : `/invite/${token}`;
        url.search = "";
        const redirect = NextResponse.redirect(url);
        redirect.cookies.delete("pending_invite");
        return redirect;
      }
    }
  }

  // Only bounce to /login when the auth lookup actually resolved and returned
  // no user. If getUser() errored (transient), let the request through rather
  // than kicking a still-signed-in user to the login screen mid-session.
  if (authResolved && !user && !isPublic(pathname)) {
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
