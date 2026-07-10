"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getRealtimeClient } from "@/lib/supabase/client";

type PresenceState = Record<string, { online_at: string }[]>;

const PresenceContext = createContext<Set<string>>(new Set());

// Tracks who is currently online via Supabase Realtime Presence. One GLOBAL
// channel for the whole app: DMs span workspaces, so someone active in any
// workspace (or the /dm shell) shows online everywhere. Presence only exposes
// user ids + a timestamp - visibility of the people themselves is still
// governed by the roster (shared workspace / DM connection).
export function PresenceProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | null = null;
    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      const channel = supabase.channel("presence:global", {
        config: { presence: { key: userId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState() as PresenceState;
          setOnlineIds(new Set(Object.keys(state)));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });
      teardown = () => void supabase.removeChannel(channel);
    });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [userId]);

  return (
    <PresenceContext.Provider value={onlineIds}>
      {children}
    </PresenceContext.Provider>
  );
}

export function useOnlineMembers() {
  return useContext(PresenceContext);
}

export function usePresence(userId: string) {
  const online = useContext(PresenceContext);
  return online.has(userId);
}
