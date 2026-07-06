import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

// A single shared browser client (and therefore a single Realtime socket) for
// the whole tab. Creating a fresh client per hook opened a new WebSocket each
// time, and those sockets could connect on the anon key before the user's auth
// token was applied - so Realtime evaluated RLS as anon and silently delivered
// nothing on protected tables (messages, notifications). One shared client that
// stays authenticated fixes live delivery across every subscription.
let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  browserClient ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return browserClient;
}

// Returns the shared client only after the Realtime socket has been handed the
// user's access token. Subscriptions created during the app's first paint (the
// sidebar/layout hooks) would otherwise call subscribe() before auth propagated
// to the socket, bind as anon, and have every RLS-protected row silently
// dropped - so live DM counts, toasts, and sounds never fired unless the room
// happened to be open. Await this before .subscribe() to guarantee the binding
// is authenticated.
export async function getRealtimeClient() {
  const client = createClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session?.access_token) {
    client.realtime.setAuth(session.access_token);
  }
  return client;
}
