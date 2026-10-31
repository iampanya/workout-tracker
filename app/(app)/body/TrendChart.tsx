"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { GOAL_METRICS, type GoalMetric } from "@/lib/body/schema";

// Same lazy-loading as the exercise ProgressChart: recharts stays out of the route's initial JS.
const TrendChartInner = dynamic(() => import("./TrendChartInner"), {
  ssr: false,
  loading: () => <div className="h-64 w-full rounded-lg motion-safe:animate-pulse bg-surface-muted" />,
});

export type TrendPoint = { date: string } & Record<GoalMetric, number | null>;

export function TrendChart({
  data,
  goalTargets,
}: {
  data: TrendPoint[];
  goalTargets: Partial<Record<GoalMetric, number>>;
}) {
  const t = useTranslations("body");
  // Only offer metrics the scans actually report.
  const metrics = GOAL_METRICS.filter((metric) => data.some((point) => point[metric] !== null));
  const [metric, setMetric] = useState<GoalMetric>(metrics[0] ?? "weight_kg");

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t("trendLabel")} className="flex gap-1 rounded-xl bg-surface-muted p-1">
        {metrics.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={metric === key}
            onClick={() => setMetric(key)}
            className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              metric === key ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {t(`trendMetrics.${key}`)}
          </button>
        ))}
      </div>
      <TrendChartInner data={data} metric={metric} goal={goalTargets[metric]} />
    </div>
  );
}
