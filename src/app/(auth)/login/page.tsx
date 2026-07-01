import Link from "next/link";
import { FormMessage } from "@/components/ui";
import { GoogleButton } from "../google-button";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const redirectedFrom =
    typeof params.redirectedFrom === "string" ? params.redirectedFrom : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;
  const signupHref = redirectedFrom
    ? `/signup?redirectedFrom=${encodeURIComponent(redirectedFrom)}`
    : "/signup";

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
          Welcome <span className="gradient-text">back</span>
        </h2>
        <p className="text-sm text-muted">Sign in to your workspace.</p>
      </div>

      {error && <FormMessage type="error">{error}</FormMessage>}

      <GoogleButton redirectedFrom={redirectedFrom} />

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <LoginForm redirectedFrom={redirectedFrom} />

      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href={signupHref} className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
