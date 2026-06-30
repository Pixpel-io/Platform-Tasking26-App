import { forwardRef } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className = "", variant = "primary", ...props }, ref) {
    const base =
      "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/50";
    const variants = {
      primary:
        "bg-primary text-primary-foreground hover:opacity-90",
      ghost:
        "text-foreground hover:bg-surface-2",
      outline:
        "border border-border text-foreground hover:bg-surface-2",
      danger: "bg-danger text-white hover:opacity-90",
    } as const;
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ${className}`}
      {...props}
    />
  );
});

export function Label({
  className = "",
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1.5 block text-sm font-medium text-foreground ${className}`}
      {...props}
    />
  );
}

export function FieldError({ message }: { message?: string | string[] }) {
  if (!message) return null;
  const text = Array.isArray(message) ? message[0] : message;
  return <p className="mt-1 text-xs text-danger">{text}</p>;
}

export function FormMessage({
  type = "error",
  children,
}: {
  type?: "error" | "success";
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm ${
        type === "error"
          ? "bg-danger/10 text-danger"
          : "bg-success/10 text-success"
      }`}
    >
      {children}
    </p>
  );
}
