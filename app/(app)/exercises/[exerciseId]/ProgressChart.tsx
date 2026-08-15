"use client";

import dynamic from "next/dynamic";

// Defer the recharts bundle out of the route's initial JS (loads client-side, ssr:false,
// only when the chart mounts). ssr:false requires a Client Component boundary (Next docs:
// Lazy Loading → Skipping SSR). Placeholder reserves the chart height (h-64) to avoid shift.
const ProgressChartInner = dynamic(() => import("./ProgressChartInner"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-surface-muted" />,
});

export function ProgressChart({
  data,
}: {
  data: { date: string; maxWeight: number; volume: number }[];
}) {
  return <ProgressChartInner data={data} />;
}
