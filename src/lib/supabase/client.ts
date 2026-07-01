import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

// A single shared browser client (and therefore a single Realtime socket) for
// the whole tab. Creating a fresh client per hook opened a new WebSocket each
// time, and those sockets could connect on the anon key before the user's auth
// token was applied — so Realtime evaluated RLS as anon and silently delivered
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
