import { type ButtonHTMLAttributes, type ReactNode } from "react";
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {loading ? <CircleNotch className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
