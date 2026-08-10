import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { CircleNotch } from "@phosphor-icons/react/ssr";

type IconButtonVariant = "default" | "danger";

const variantClasses: Record<IconButtonVariant, string> = {
  default: "text-muted hover:bg-surface-muted hover:text-foreground",
  danger: "text-danger hover:bg-danger/10",
};

export function IconButton({
  icon,
  "aria-label": ariaLabel,
  variant = "default",
  loading = false,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  "aria-label": string;
  variant?: IconButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      aria-label={ariaLabel}
      disabled={disabled || loading}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? <CircleNotch className="h-4 w-4 animate-spin" /> : icon}
    </button>
  );
}
