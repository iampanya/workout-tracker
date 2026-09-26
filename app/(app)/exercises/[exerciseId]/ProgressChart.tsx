"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { SessionSeriesPoint } from "@/lib/progress";

// Defer the recharts bundle out of the route's initial JS (loads client-side, ssr:false,
// only when the chart mounts). ssr:false requires a Client Component boundary (Next docs:
// Lazy Loading → Skipping SSR). Placeholder reserves the chart height (h-64) to avoid shift.
const ProgressChartInner = dynamic(() => import("./ProgressChartInner"), {
  ssr: false,
  loading: () => <div className="h-64 w-full rounded-lg motion-safe:animate-pulse bg-surface-muted" />,
});

export type ProgressMetric = "maxWeight" | "e1rm" | "volume";

const METRICS: { key: ProgressMetric; label: string }[] = [
  { key: "maxWeight", label: "Max weight" },
  { key: "e1rm", label: "Est. 1RM" },
  { key: "volume", label: "Volume" },
];

export function ProgressChart({ data }: { data: SessionSeriesPoint[] }) {
  const [metric, setMetric] = useState<ProgressMetric>("maxWeight");

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Chart metric"
        className="flex gap-1 rounded-xl bg-surface-muted p-1"
      >
        {METRICS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={metric === key}
            onClick={() => setMetric(key)}
            className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              metric === key
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <ProgressChartInner data={data} metric={metric} />
    </div>
  );
}
