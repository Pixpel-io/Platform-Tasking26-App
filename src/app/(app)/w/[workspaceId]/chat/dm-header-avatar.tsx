"use client";

import { Avatar } from "@/components/avatar";
import { usePresence } from "@/components/presence-provider";

// DM header avatar with a live presence dot, so the top of a direct message
// shows whether the other person is currently online.
export function DmHeaderAvatar({
  userId,
  name,
  email,
  avatarUrl,
}: {
  userId: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}) {
  const online = usePresence(userId);
  return (
    <span className="relative">
      <Avatar name={name} email={email} avatarUrl={avatarUrl} size="md" />
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
          online ? "bg-success" : "bg-muted/40"
        }`}
        title={online ? "Active now" : "Offline"}
      />
    </span>
  );
}
