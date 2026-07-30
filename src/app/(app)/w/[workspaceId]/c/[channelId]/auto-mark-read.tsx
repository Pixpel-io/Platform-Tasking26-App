"use client";

import { useEffect } from "react";
import { markChannelNotificationsRead } from "../../notifications-actions";

// Slack-style: opening a channel clears every unread notification tied to it
// (group messages, mentions). Runs once per channel visit; the UPDATE
// broadcasts over realtime so the bell / inbox refresh without a reload.
export function AutoMarkChannelRead({ channelId }: { channelId: string }) {
  useEffect(() => {
    void markChannelNotificationsRead(channelId);
  }, [channelId]);
  return null;
}
