import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import type { Consistency } from "@/lib/insights/analysis";

const BAR_MAX_PX = 64;

// weekLabels are formatted on the server, one per consistency.weeks entry.
export function ConsistencyCard({ consistency, weekLabels }: { consistency: Consistency; weekLabels: string[] }) {
  const t = useTranslations("insights");
  const format = useFormatter();
  const most = Math.max(1, ...consistency.weeks.map((w) => w.sessions));

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("consistencyTitle")}</h2>
      <Card className="space-y-4">
        <p className="text-sm">
          {t("averagePerWeek", { count: format.number(consistency.averagePerWeek, { maximumFractionDigits: 1 }) })}
        </p>
        <ul className="flex items-end gap-1.5">
          {consistency.weeks.map((week, i) => (
            <li key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="font-mono text-xs tabular-nums text-muted">{week.sessions}</span>
              <span
                aria-hidden
                className={`w-full rounded-t ${week.partial ? "bg-accent/40" : "bg-accent"}`}
                style={{ height: `${Math.max(2, (week.sessions / most) * BAR_MAX_PX)}px` }}
              />
              <span className="w-full truncate text-center text-[10px] text-muted">{weekLabels[i]}</span>
            </li>
          ))}
        </ul>
        {consistency.skipped.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <h3 className="text-sm font-medium">{t("skippedTitle")}</h3>
            <ul className="space-y-1">
              {consistency.skipped.map((s) => (
                <li key={`${s.routineId}-${s.exerciseId}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{s.exerciseName}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {t("skippedRow", { routine: s.routineName, skipped: s.skipped, sessions: s.sessions })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </section>
  );
}
