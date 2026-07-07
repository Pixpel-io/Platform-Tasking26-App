"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageWithRelations } from "@/lib/chat-shared";
import { playNotificationSound } from "@/lib/notify-sound";

// Chat message ding: plays the user's chosen notification tone.
function playDing() {
  playNotificationSound();
}

// Tracks new incoming messages from OTHER users so the room can show an unread
// count and play a notification sound. Messages the current user sends never
// count and never ding. The count only accrues while the user is scrolled away
// from the bottom; when they're at the bottom they're "reading" so it stays 0.
// `initialCount` seeds the pill with unreads that already existed when the
// room opened (the user lands at the first of them, above the bottom).
export function useMessageAlerts(
  messages: MessageWithRelations[],
  meId: string,
  initialCount = 0,
) {
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const atBottomRef = useRef(true);
  const seenRef = useRef<Set<string>>(new Set());

  // Seed the seen-set with whatever was already on screen at mount so existing
  // history doesn't trigger a flood of alerts.
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    for (const m of messages) seenRef.current.add(m.id);
    initializedRef.current = true;
  }

  useEffect(() => {
    let fromOthers = 0;
    for (const m of messages) {
      if (seenRef.current.has(m.id)) continue;
      seenRef.current.add(m.id);
      if (m.id.startsWith("temp-")) continue; // optimistic echo, not a real arrival
      if (m.user_id === meId) continue; // own messages never alert
      fromOthers += 1;
    }
    if (fromOthers > 0) {
      playDing();
      if (!atBottomRef.current) setUnreadCount((c) => c + fromOthers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const clear = useCallback(() => setUnreadCount(0), []);

  // Called by the scroll listener: at the bottom we clear and stop accruing.
  const setAtBottom = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
    if (atBottom) setUnreadCount(0);
  }, []);

  return { unreadCount, clear, setAtBottom };
}
