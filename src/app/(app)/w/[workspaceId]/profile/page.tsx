import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { ProfileForm } from "./profile-form";
import { QrLoginCard } from "./qr-login";
import { GetAndroidAppCard } from "./get-android-app-card";

export default async function ProfilePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Your profile</h1>
        <p className="mt-1 text-muted">
          This is how teammates see you across the workspace.
        </p>
      </header>
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <ProfileForm profile={profile} />
      </div>
      <QrLoginCard />
      <GetAndroidAppCard />
    </div>
  );
}
