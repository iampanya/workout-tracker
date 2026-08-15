"use client";

import dynamic from "next/dynamic";

// Defer the recharts bundle out of the route's initial JS: it only loads (client-side,
// ssr:false) once this chart mounts. next/dynamic with ssr:false must live in a Client
// Component (Next docs: Lazy Loading → Skipping SSR), hence this thin wrapper. The
// placeholder reserves the chart's height (h-48) to avoid layout shift.
const WeeklyVolumeChartInner = dynamic(() => import("./WeeklyVolumeChartInner"), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-lg bg-surface-muted" />,
});

export function WeeklyVolumeChart({ data }: { data: { weekStart: string; volumeKg: number }[] }) {
  return <WeeklyVolumeChartInner data={data} />;
}
