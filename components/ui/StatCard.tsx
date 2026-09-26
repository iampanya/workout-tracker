import { type ReactNode } from "react";
import Link from "next/link";
import { Card } from "./Card";

type StatCardTone = "neutral" | "success" | "danger";

const toneClasses: Record<StatCardTone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  danger: "text-danger",
};

export function StatCard({
  label,
  value,
  unit,
  icon,
  badge,
  tone = "neutral",
  href,
  className = "",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  // Small marker next to the label (e.g. a "NEW" badge).
  badge?: ReactNode;
  tone?: StatCardTone;
  // When set, the whole card links there.
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-muted">{label}</span>
          {badge}
        </span>
        {icon && <span className={`shrink-0 ${toneClasses[tone]}`}>{icon}</span>}
      </div>
      <div
        className={`truncate font-mono text-xl font-semibold tabular-nums sm:text-2xl ${toneClasses[tone]}`}
      >
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-surface p-4 transition [touch-action:manipulation] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      >
        {body}
      </Link>
    );
  }
  return <Card className={`flex min-w-0 flex-col gap-1 ${className}`}>{body}</Card>;
}
