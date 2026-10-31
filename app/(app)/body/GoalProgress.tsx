import { useFormatter, useTranslations } from "next-intl";
import { goalProgress } from "@/lib/body/metrics";

// One goal: "label   start → target unit · 40%" over a 0–100% bar (see goalProgress).
export function GoalProgress({
  label,
  unit,
  start,
  target,
  current,
}: {
  label: string;
  unit: string;
  start: number;
  target: number;
  current: number | null;
}) {
  const t = useTranslations("body");
  const format = useFormatter();
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const pct = current === null ? 0 : goalProgress(start, target, current);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
          {t("goalRange", { start: n(start), target: n(target), unit })} · {t("goalPercent", { percent: pct })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-success" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
