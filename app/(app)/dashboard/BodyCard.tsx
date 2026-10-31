import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { CaretRight, PersonSimple } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/Card";
import { METRIC_UNITS, scanDelta } from "@/lib/body/metrics";
import type { ScanMetricKey } from "@/lib/body/schema";
import type { BodyGoal, BodySummary } from "@/lib/body/service";
import { formatRelativeDate } from "@/lib/sessions/summary";
import { DeltaBadge } from "../body/DeltaBadge";
import { GoalProgress } from "../body/GoalProgress";

const CARD_METRICS: ScanMetricKey[] = ["weight_kg", "body_fat_pct", "skeletal_muscle_kg"];

const LINK_CLASS =
  "block rounded-2xl p-4 transition [touch-action:manipulation] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// The phone's way into /body (it has no bottom-nav tab), so it's shown even with no scans.
export function BodyCard({
  summary,
  goals,
  today,
}: {
  summary: BodySummary | null;
  goals: BodyGoal[];
  today: string;
}) {
  const t = useTranslations("dashboard");
  const tb = useTranslations("body");
  const tc = useTranslations("common");
  const locale = useLocale();
  const format = useFormatter();

  if (!summary) {
    return (
      <Card padding={false}>
        <Link href="/body" className={`${LINK_CLASS} flex items-center gap-3`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <PersonSimple className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t("bodyEmptyTitle")}</span>
            <span className="block text-sm text-muted">{t("bodyEmptyDescription")}</span>
          </span>
          <CaretRight className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      </Card>
    );
  }

  const { latest, previous } = summary;
  const when = formatRelativeDate(latest.scan_date, today, locale, {
    today: tc("today"),
    yesterday: tc("yesterday"),
  });

  return (
    <Card padding={false}>
      <Link href="/body" className={`${LINK_CLASS} space-y-4`}>
        <div className="flex items-center justify-between gap-2 text-sm text-muted">
          <span>{t("bodyLastScan", { when })}</span>
          <CaretRight className="h-4 w-4 shrink-0" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CARD_METRICS.map((metric) => {
            const value = latest[metric];
            return (
              <div key={metric} className="min-w-0 space-y-1">
                <div className="truncate text-xs font-medium text-muted">{tb(`metrics.${metric}`)}</div>
                <div className="font-mono text-lg font-semibold tabular-nums">
                  {value === null ? "–" : format.number(value, { maximumFractionDigits: 2 })}
                  {METRIC_UNITS[metric] && (
                    <span className="ml-1 text-xs font-normal text-muted">{METRIC_UNITS[metric]}</span>
                  )}
                </div>
                <DeltaBadge metric={metric} delta={previous ? scanDelta(value, previous[metric]) : null} />
              </div>
            );
          })}
        </div>
        {goals.length > 0 && (
          <div className="space-y-3">
            {goals.map((goal) => (
              <GoalProgress
                key={goal.metric}
                label={tb(`metrics.${goal.metric}`)}
                unit={METRIC_UNITS[goal.metric]}
                start={goal.start_value}
                target={goal.target}
                current={latest[goal.metric]}
              />
            ))}
          </div>
        )}
      </Link>
    </Card>
  );
}
