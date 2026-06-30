import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-foreground">
          Choose a new password
        </h2>
        <p className="text-sm text-muted">
          Enter a new password for your account.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
