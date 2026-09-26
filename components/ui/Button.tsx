import { type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { CircleNotch } from "@phosphor-icons/react/ssr";

type ButtonVariant = "primary" | "secondary" | "success" | "ghost" | "danger";
type ButtonSize = "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "border border-border bg-surface text-foreground hover:bg-surface-muted",
  success: "bg-success text-success-foreground hover:opacity-90",
  ghost: "text-muted hover:text-foreground",
  danger: "text-danger hover:bg-danger/10",
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50";

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `${BASE_CLASSES} ${variantClasses[variant]} ${sizeClasses[size]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`${buttonClasses(variant, size)} ${className}`}
      {...rest}
    >
      {loading ? <CircleNotch className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// A navigation link styled as a Button (same variants/sizes), for CTAs that go to a page.
export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  children,
  className = "",
  ...rest
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}) {
  return (
    <Link className={`${buttonClasses(variant, size)} ${className}`} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
