import { forwardRef } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className = "", variant = "primary", size = "md", ...props },
    ref,
  ) {
    const base =
      "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
    const sizes = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-5 py-2.5 text-sm",
    } as const;
    const variants = {
      primary:
        "bg-primary text-primary-foreground shadow-sm hover:-translate-y-px hover:opacity-95 hover:shadow-md hover:shadow-primary/25",
      ghost: "text-foreground hover:bg-surface-2",
      outline:
        "border border-border text-foreground hover:bg-surface-2 hover:border-primary/40",
      danger:
        "bg-danger text-white shadow-sm hover:-translate-y-px hover:opacity-95 hover:shadow-md hover:shadow-danger/25",
    } as const;
    return (
      <button
        ref={ref}
        className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
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
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground transition-colors duration-150 placeholder:text-muted hover:border-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ${className}`}
      {...props}
    />
  );
});

export function Card({
  className = "",
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={`card ${interactive ? "card-interactive cursor-pointer" : ""} ${className}`}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex animate-fade-in-up flex-col items-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-14 text-center ${className}`}
    >
      {icon && (
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/10">
          {icon}
        </span>
      )}
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

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
      className={`animate-fade-in-up rounded-lg px-3 py-2 text-sm ${
        type === "error"
          ? "bg-danger/10 text-danger"
          : "bg-success/10 text-success"
      }`}
    >
      {children}
    </p>
  );
}
