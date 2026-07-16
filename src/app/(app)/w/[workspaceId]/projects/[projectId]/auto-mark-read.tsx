"use client";

import { useEffect } from "react";
import { markProjectNotificationsRead } from "../../notifications-actions";

// Slack-style: opening the board dismisses every unread notification tied to
// it. Runs once per project visit; the UPDATE broadcasts over realtime so the
// sidebar badge (and any other tab) clears without a refresh.
export function AutoMarkProjectRead({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  useEffect(() => {
    void markProjectNotificationsRead(workspaceId, projectId);
  }, [workspaceId, projectId]);
  return null;
}
