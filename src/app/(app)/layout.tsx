import { redirect } from "next/navigation";
import { getMyWorkspaces, requireUser } from "@/lib/auth";

// Gate: any route under (app) requires an authenticated user. We do NOT do the
// auth check in this layout alone (layouts don't re-render on every nav) - the
// proxy already enforces it; this is the data-layer guard.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const workspaces = await getMyWorkspaces();

  // No workspace yet → force onboarding (except the create page itself,
  // which lives outside this layout's data needs).
  if (workspaces.length === 0) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
