"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { changePassword } from "@/app/(app)/actions";
import {
  Button,
  FieldError,
  FormMessage,
  Input,
  Label,
} from "@/components/ui";

// "Change password" card on the profile page. Only rendered for accounts
// that actually have an email/password identity - callers pass hasPassword
// = false for pure OAuth (Google, Microsoft) users and see the read-only
// notice instead.
export function PasswordChangeCard({
  hasPassword,
  providerLabel,
}: {
  hasPassword: boolean;
  providerLabel: string | null;
}) {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  // Individual show/hide toggles so the user can double-check what they typed
  // without exposing all three fields at once.
  const [reveal, setReveal] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  // Clear the form once the server action reports success.
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  if (!hasPassword) {
    return (
      <section className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">
          Change password
        </h2>
        <p className="mt-2 text-sm text-muted">
          Your account signs in with{" "}
          <span className="font-medium text-foreground">
            {providerLabel ?? "an external provider"}
          </span>
          , so your password is managed there. Update it in your provider
          account and it will apply to Tasking too.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Change password</h2>
      <p className="mt-1 text-sm text-muted">
        Enter your current password, then choose a new one. You&apos;ll stay
        signed in on this device.
      </p>

      <form ref={formRef} action={action} className="mt-4 space-y-4">
        {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
        {state?.success && (
          <FormMessage type="success">{state.success}</FormMessage>
        )}

        <PasswordField
          id="currentPassword"
          label="Current password"
          reveal={reveal.currentPassword}
          onToggle={() =>
            setReveal((r) => ({
              ...r,
              currentPassword: !r.currentPassword,
            }))
          }
          error={state?.fieldErrors?.currentPassword}
          autoComplete="current-password"
        />
        <PasswordField
          id="newPassword"
          label="New password"
          reveal={reveal.newPassword}
          onToggle={() =>
            setReveal((r) => ({ ...r, newPassword: !r.newPassword }))
          }
          error={state?.fieldErrors?.newPassword}
          autoComplete="new-password"
          hint="At least 8 characters."
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm new password"
          reveal={reveal.confirmPassword}
          onToggle={() =>
            setReveal((r) => ({
              ...r,
              confirmPassword: !r.confirmPassword,
            }))
          }
          error={state?.fieldErrors?.confirmPassword}
          autoComplete="new-password"
        />

        <Button type="submit" disabled={pending}>
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </section>
  );
}

function PasswordField({
  id,
  label,
  reveal,
  onToggle,
  error,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  reveal: boolean;
  onToggle: () => void;
  error?: string[];
  hint?: string;
  autoComplete: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={reveal ? "text" : "password"}
          autoComplete={autoComplete}
          className="pr-10"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={reveal ? "Hide password" : "Show password"}
          title={reveal ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {reveal ? (
              <>
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.77 19.77 0 0 1-3.16 4.19M14.12 14.12A3 3 0 1 1 9.88 9.88M1 1l22 22" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
      {hint && !error && (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      )}
      <FieldError message={error} />
    </div>
  );
}
