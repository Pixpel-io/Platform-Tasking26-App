import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ProfileForm } from "./profile-form";
import { QrLoginCard } from "./qr-login";
import { GetAndroidAppCard } from "./get-android-app-card";
import { PasswordChangeCard } from "./password-change-card";

// Human-friendly label for the OAuth provider the user actually signed in
// with, used on the "your password is managed elsewhere" notice.
const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  azure: "Microsoft",
  microsoft: "Microsoft",
  github: "GitHub",
  apple: "Apple",
};

export default async function ProfilePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Whether this account has an email/password identity - purely OAuth users
  // (Google, Microsoft, etc.) can't change a password here; their provider
  // owns it.
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const identities = userData?.user?.identities ?? [];
  const hasPassword = identities.some((i) => i.provider === "email");
  const nonEmail = identities.find((i) => i.provider !== "email");
  const providerLabel = nonEmail
    ? (PROVIDER_LABELS[nonEmail.provider] ?? nonEmail.provider)
    : null;

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Your profile</h1>
        <p className="mt-1 text-muted">
          This is how teammates see you across the workspace.
        </p>
      </header>
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <ProfileForm profile={profile} />
      </div>
      <PasswordChangeCard
        hasPassword={hasPassword}
        providerLabel={providerLabel}
      />
      <QrLoginCard />
      <GetAndroidAppCard />
    </div>
  );
}
