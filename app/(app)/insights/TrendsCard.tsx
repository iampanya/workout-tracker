import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { CaretRight, Equals, TrendDown, TrendUp } from "@phosphor-icons/react/ssr";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { ExerciseTrend, TrendStatus } from "@/lib/insights/analysis";

// Problems first.
const STATUSES: TrendStatus[] = ["declining", "plateau", "progressing"];
const STATUS_TONE: Record<TrendStatus, BadgeTone> = { progressing: "success", plateau: "neutral", declining: "danger" };
const STATUS_ICON = { progressing: TrendUp, plateau: Equals, declining: TrendDown };

export function TrendsCard({ trends }: { trends: ExerciseTrend[] }) {
  const t = useTranslations("insights");
  const format = useFormatter();

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("trendsTitle")}</h2>
      <Card className="space-y-4">
        <p className="text-sm text-muted">{t("trendsHint")}</p>
        {trends.length === 0 ? (
          <p className="text-sm text-muted">{t("trendsEmpty")}</p>
        ) : (
          STATUSES.map((status) => {
            const rows = trends.filter((trend) => trend.status === status);
            if (rows.length === 0) return null;
            const Icon = STATUS_ICON[status];
            return (
              <div key={status} className="space-y-1">
                <Badge tone={STATUS_TONE[status]} icon={<Icon className="h-3 w-3" />}>
                  {t(`status.${status}`)}
                </Badge>
                <p className="text-xs text-muted">{t(`tip.${status}`)}</p>
                <ul className="divide-y divide-border">
                  {rows.map((row) => (
                    <li key={row.exerciseId}>
                      <Link
                        href={`/exercises/${row.exerciseId}`}
                        className="flex min-h-11 items-center justify-between gap-2 rounded-lg text-sm [touch-action:manipulation] hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="truncate">{row.name}</span>
                        <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums text-muted">
                          {format.number(row.changePct / 100, {
                            style: "percent",
                            maximumFractionDigits: 1,
                            signDisplay: "exceptZero",
                          })}
                          <CaretRight className="h-4 w-4" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </Card>
    </section>
  );
}
