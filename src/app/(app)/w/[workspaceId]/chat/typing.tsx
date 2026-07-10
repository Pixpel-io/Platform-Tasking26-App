"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getRealtimeClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Target = { channelId?: string; conversationId?: string };

type TypingPayload = { userId: string; name: string; room: string };

function roomKey(target: Target): string {
  return target.channelId ?? target.conversationId ?? "";
}

// room -> (userId -> display name) of everyone currently typing there.
type RoomsState = Map<string, Map<string, string>>;

const TypingContext = createContext<{
  rooms: RoomsState;
  broadcast: (target: Target) => void;
}>({ rooms: new Map(), broadcast: () => {} });

// One workspace-wide broadcast channel for typing. Ephemeral (never hits the
// database) and shared by every consumer - the chat room, the chat header and
// the sidebar DM list - so a single subscription powers all indicators.
export function TypingProvider({
  meId,
  meName,
  children,
}: {
  meId: string;
  meName: string;
  children: React.ReactNode;
}) {
  const [rooms, setRooms] = useState<RoomsState>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef<Map<string, number>>(new Map());
  // One expiry timer per room:user pair.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | null = null;
    const timers = timersRef.current;
    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      // Global channel (not per-workspace): DMs are shared across workspaces,
      // so both sides must meet on the same broadcast channel regardless of
      // which workspace they're browsing. Room keys are unique ids.
      const channel = supabase.channel(`typing:global`, {
        config: { broadcast: { self: false } },
      });

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as TypingPayload;
        if (p.userId === meId || !p.room) return;
        setRooms((prev) => {
          const next = new Map(prev);
          const users = new Map(next.get(p.room));
          users.set(p.userId, p.name);
          next.set(p.room, users);
          return next;
        });
        const timerKey = `${p.room}:${p.userId}`;
        clearTimeout(timers.get(timerKey));
        timers.set(
          timerKey,
          setTimeout(() => {
            setRooms((prev) => {
              const users = prev.get(p.room);
              if (!users?.has(p.userId)) return prev;
              const next = new Map(prev);
              const nextUsers = new Map(users);
              nextUsers.delete(p.userId);
              if (nextUsers.size === 0) next.delete(p.room);
              else next.set(p.room, nextUsers);
              return next;
            });
          }, 3000),
        );
      })
        .subscribe();

      channelRef.current = channel;
      teardown = () => {
        supabase.removeChannel(channel);
        channelRef.current = null;
      };
    });

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      teardown?.();
    };
  }, [meId]);

  const broadcast = useCallback(
    (target: Target) => {
      const room = roomKey(target);
      if (!room) return;
      const now = Date.now();
      if (now - (lastSentRef.current.get(room) ?? 0) < 1500) return; // throttle
      lastSentRef.current.set(room, now);
      channelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: meId, name: meName, room } satisfies TypingPayload,
      });
    },
    [meId, meName],
  );

  const value = useMemo(() => ({ rooms, broadcast }), [rooms, broadcast]);
  return (
    <TypingContext.Provider value={value}>{children}</TypingContext.Provider>
  );
}

// Names of everyone currently typing in a room.
export function useTypingIn(target: Target): string[] {
  const { rooms } = useContext(TypingContext);
  const users = rooms.get(roomKey(target));
  return useMemo(() => (users ? [...users.values()] : []), [users]);
}

// Stable "I'm typing" broadcaster for a room, throttled by the provider.
export function useTypingBroadcast(target: Target): () => void {
  const { broadcast } = useContext(TypingContext);
  const { channelId, conversationId } = target;
  return useCallback(
    () => broadcast({ channelId, conversationId }),
    [broadcast, channelId, conversationId],
  );
}

// Bottom-of-chat pill shown above the composer.
export function TypingIndicator({ users }: { users: string[] }) {
  if (users.length === 0) return <div className="h-6" />;
  return (
    <div className="flex h-6 items-center px-5">
      <span className="inline-flex animate-fade-in items-center gap-2 rounded-full bg-primary/8 px-2.5 py-0.5 text-[11px] font-medium text-primary">
        <TypingDots />
        {formatTyping(users)}
      </span>
    </div>
  );
}

// Live header subtitle: shows "<name> is typing…" while someone types in this
// room, and falls back to the static subtitle (email / description) otherwise.
export function TypingSubtitle({
  target,
  fallback,
}: {
  target: Target;
  fallback?: string | null;
}) {
  const users = useTypingIn(target);
  if (users.length === 0) return fallback ? <>{fallback}</> : null;
  return (
    <span className="inline-flex animate-fade-in items-center gap-1.5 font-medium text-primary">
      <TypingDots />
      {formatTyping(users)}
    </span>
  );
}

// Sidebar row meta: animated "..." while someone types in that DM/group
// (Slack-style), otherwise the unread badge.
export function SidebarRowMeta({
  target,
  unread,
}: {
  target: Target;
  unread: number;
}) {
  const users = useTypingIn(target);
  if (users.length > 0) {
    return (
      <span
        className="flex h-5 animate-fade-in items-center rounded-full bg-primary/10 px-2"
        aria-label={formatTyping(users)}
        title={formatTyping(users)}
      >
        <TypingDots />
      </span>
    );
  }
  if (unread > 0) {
    return (
      <span className="grid h-5 min-w-5 animate-scale-in place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/30">
        {unread > 99 ? "99+" : unread}
      </span>
    );
  }
  return null;
}

function formatTyping(users: string[]): string {
  const names = users.map((n) => n || "Someone");
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function TypingDots() {
  return (
    <span className="flex gap-0.5">
      <Dot delay="0ms" />
      <Dot delay="150ms" />
      <Dot delay="300ms" />
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1 w-1 animate-bounce rounded-full bg-primary"
      style={{ animationDelay: delay }}
    />
  );
}
