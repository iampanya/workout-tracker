"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { SessionSeriesPoint } from "@/lib/progress";
import { formatShortDate } from "@/lib/sessions/summary";
import type { ProgressMetric } from "./ProgressChart";

const METRIC_LABEL: Record<ProgressMetric, string> = {
  maxWeight: "Max weight",
  e1rm: "Est. 1RM",
  volume: "Volume",
};

// "2026-09-23" -> "9/23" for a compact axis.
function axisDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export default function ProgressChartInner({
  data,
  metric,
}: {
  data: SessionSeriesPoint[];
  metric: ProgressMetric;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="var(--border)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={axisDate}
            minTickGap={16}
          />
          <YAxis
            stroke="var(--border)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            width={44}
            domain={["auto", "auto"]}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value)
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted)" }}
            labelFormatter={(label) => formatShortDate(String(label))}
            formatter={(value) => [
              `${Math.round(Number(value) * 10) / 10} kg`,
              METRIC_LABEL[metric],
            ]}
          />
          <Line
            type="monotone"
            dataKey={metric}
            stroke="var(--chart-line)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--chart-line)" }}
            activeDot={{ r: 5 }}
            name={METRIC_LABEL[metric]}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
