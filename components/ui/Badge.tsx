import { type ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "success"
  | "danger"
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "core";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-muted",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  chest: "bg-muscle-chest/15 text-muscle-chest",
  back: "bg-muscle-back/15 text-muscle-back",
  legs: "bg-muscle-legs/15 text-muscle-legs",
  shoulders: "bg-muscle-shoulders/15 text-muscle-shoulders",
  arms: "bg-muscle-arms/15 text-muscle-arms",
  core: "bg-muscle-core/15 text-muscle-core",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
