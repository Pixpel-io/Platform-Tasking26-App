import Link from "next/link";
import { GoogleButton, MicrosoftButton } from "../oauth-buttons";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const params = await searchParams;
  const redirectedFrom =
    typeof params.redirectedFrom === "string"
      ? params.redirectedFrom
      : undefined;
  const loginHref = redirectedFrom
    ? `/login?redirectedFrom=${encodeURIComponent(redirectedFrom)}`
    : "/login";

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
          Create your <span className="gradient-text">account</span>
        </h2>
        <p className="text-sm text-muted">Start collaborating in minutes.</p>
      </div>

      <div className="space-y-2.5">
        <GoogleButton redirectedFrom={redirectedFrom} />
        <MicrosoftButton redirectedFrom={redirectedFrom} />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <SignupForm redirectedFrom={redirectedFrom} />

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
