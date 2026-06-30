import { getNotifications } from "@/lib/notifications";
import { NotificationsList } from "./notifications-list";

export default async function NotificationsPage({
  params,
}: PageProps<"/w/[workspaceId]/notifications">) {
  const { workspaceId } = await params;
  const notifications = await getNotifications(workspaceId);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <NotificationsList
        workspaceId={workspaceId}
        initial={notifications}
      />
    </div>
  );
}
