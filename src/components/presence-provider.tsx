"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PresenceState = Record<string, { online_at: string }[]>;

const PresenceContext = createContext<Set<string>>(new Set());

// Tracks who is currently online in a workspace via Supabase Realtime Presence.
// Channel is scoped per workspace so presence is isolated.
export function PresenceProvider({
  workspaceId,
  userId,
  children,
}: {
  workspaceId: string;
  userId: string;
  children: React.ReactNode;
}) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`presence:workspace:${workspaceId}`, {
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, userId]);

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
