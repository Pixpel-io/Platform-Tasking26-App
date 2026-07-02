"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Target = { channelId?: string; conversationId?: string };

type TypingPayload = { userId: string; name: string };

// Broadcast-based typing: ephemeral, never hits the database.
export function useTyping(target: Target, meId: string, meName: string) {
  const key = target.channelId ?? target.conversationId ?? "";
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!key) return;
    const supabase = createClient();
    const channel = supabase.channel(`typing:${key}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as TypingPayload;
        if (p.userId === meId) return;
        setTypingUsers((prev) => new Map(prev).set(p.userId, p.name));
        const timers = timersRef.current;
        clearTimeout(timers.get(p.userId));
        timers.set(
          p.userId,
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Map(prev);
              next.delete(p.userId);
              return next;
            });
          }, 3000),
        );
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [key, meId]);

  const broadcastTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return; // throttle
    lastSentRef.current = now;
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: meId, name: meName } satisfies TypingPayload,
    });
  }, [meId, meName]);

  return { typingUsers: [...typingUsers.values()], broadcastTyping };
}

export function TypingIndicator({ users }: { users: string[] }) {
  if (users.length === 0) return <div className="h-6" />;
  return (
    <div className="flex h-6 items-center px-5">
      <span className="inline-flex animate-fade-in items-center gap-2 rounded-full bg-primary/8 px-2.5 py-0.5 text-[11px] font-medium text-primary">
        <span className="flex gap-0.5">
          <Dot delay="0ms" />
          <Dot delay="150ms" />
          <Dot delay="300ms" />
        </span>
        {formatTyping(users)}
      </span>
    </div>
  );
}

function formatTyping(users: string[]): string {
  const names = users.map((n) => n || "Someone");
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1 w-1 animate-bounce rounded-full bg-primary"
      style={{ animationDelay: delay }}
    />
  );
}
