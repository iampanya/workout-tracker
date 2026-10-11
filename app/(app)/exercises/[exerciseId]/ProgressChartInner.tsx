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
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { SessionSeriesPoint } from "@/lib/progress";
import { formatAxisDate, formatShortDate } from "@/lib/sessions/summary";
import type { ProgressMetric } from "./ProgressChart";

export default function ProgressChartInner({
  data,
  metric,
}: {
  data: SessionSeriesPoint[];
  metric: ProgressMetric;
}) {
  const locale = useLocale();
  const t = useTranslations("exercises");
  const format = useFormatter();
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="var(--border)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={(date: string) => formatAxisDate(date, locale)}
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
            separator=": "
            contentStyle={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted)" }}
            labelFormatter={(label) => formatShortDate(String(label), locale)}
            formatter={(value) => [
              `${format.number(Math.round(Number(value) * 10) / 10)} kg`,
              t(metric),
            ]}
          />
          <Line
            type="monotone"
            dataKey={metric}
            stroke="var(--chart-line)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--chart-line)" }}
            activeDot={{ r: 5 }}
            name={t(metric)}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
