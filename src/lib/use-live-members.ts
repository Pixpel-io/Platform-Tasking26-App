"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

// Keeps the sidebar member list's profiles (name, avatar, etc.) fresh. The
// sidebar lives in the layout, which Next.js does NOT re-render on navigation,
// so a teammate's newly uploaded avatar or renamed profile would otherwise stay
// stale until a full reload. This subscribes to profile UPDATEs and patches the
// matching member in place.
export function useLiveMembers(
  initial: Profile[],
  channelName = "sidebar:profiles",
): Profile[] {
  const [members, setMembers] = useState<Profile[]>(initial);

  // Re-seed when the server list changes (e.g. a member added/removed) -
  // reset during render (React's recommended pattern), not in an effect.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setMembers(initial);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const updated = payload.new as Profile;
          setMembers((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName]);

  return members;
}
