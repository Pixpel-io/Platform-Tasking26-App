import Link from "next/link";
import { GoogleButton } from "../google-button";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-foreground">
          Create your account
        </h2>
        <p className="text-sm text-muted">Start collaborating in minutes.</p>
      </div>

      <GoogleButton />

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <SignupForm />

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
