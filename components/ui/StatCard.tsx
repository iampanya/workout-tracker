import { type ReactNode } from "react";
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
  tone = "neutral",
  className = "",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  tone?: StatCardTone;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        {icon && <span className={toneClasses[tone]}>{icon}</span>}
      </div>
      <div className={`font-mono text-2xl font-semibold ${toneClasses[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </div>
    </Card>
  );
}
