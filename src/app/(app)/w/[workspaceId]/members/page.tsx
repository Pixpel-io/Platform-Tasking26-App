import { redirect } from "next/navigation";

// Members management moved under Settings. Keep this route as a redirect so old
// links, bookmarks, and revalidate targets still resolve.
export default async function MembersPage({
  params,
}: PageProps<"/w/[workspaceId]/members">) {
  const { workspaceId } = await params;
  redirect(`/w/${workspaceId}/settings/members`);
}
