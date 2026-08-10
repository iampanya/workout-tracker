import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type IconButtonVariant = "default" | "danger";

const variantClasses: Record<IconButtonVariant, string> = {
  default: "text-muted hover:bg-border/30 hover:text-foreground",
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
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    </button>
  );
}
