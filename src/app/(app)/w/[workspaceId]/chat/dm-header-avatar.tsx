"use client";

import { Avatar } from "@/components/avatar";
import { usePresence } from "@/components/presence-provider";
import { useProfileCard } from "@/components/profile-card";
import type { Profile } from "@/lib/supabase/types";

// DM header avatar with a live presence dot, so the top of a direct message
// shows whether the other person is currently online. Clicking it opens the
// person's profile card.
export function DmHeaderAvatar({ profile }: { profile: Profile }) {
  const online = usePresence(profile.id);
  const openProfile = useProfileCard();

  return (
    <button
      type="button"
      onClick={() => openProfile(profile)}
      aria-label={`View ${profile.full_name ?? profile.email} profile`}
      className="relative shrink-0 cursor-pointer rounded-full transition-transform duration-150 hover:scale-105"
    >
      <Avatar
        name={profile.full_name}
        email={profile.email}
        avatarUrl={profile.avatar_url}
        size="md"
      />
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
          online ? "bg-success" : "bg-muted/40"
        }`}
        title={online ? "Active now" : "Offline"}
      />
    </button>
  );
}
