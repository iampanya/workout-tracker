"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { METRIC_UNITS } from "@/lib/body/metrics";
import type { GoalMetric } from "@/lib/body/schema";
import { formatAxisDate, formatShortDate } from "@/lib/sessions/summary";
import type { TrendPoint } from "./TrendChart";

export default function TrendChartInner({
  data,
  metric,
  goal,
}: {
  data: TrendPoint[];
  metric: GoalMetric;
  goal: number | undefined;
}) {
  const locale = useLocale();
  const t = useTranslations("body");
  const format = useFormatter();
  const unit = METRIC_UNITS[metric];
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
            width={40}
            domain={["auto", "auto"]}
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
              `${format.number(Number(value), { maximumFractionDigits: 2 })} ${unit}`.trim(),
              t(`metrics.${metric}`),
            ]}
          />
          {goal !== undefined && (
            <ReferenceLine
              y={goal}
              stroke="var(--success)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{ value: t("goalLine"), fill: "var(--muted)", fontSize: 12, position: "insideTopRight" }}
            />
          )}
          <Line
            type="monotone"
            dataKey={metric}
            connectNulls
            stroke="var(--chart-line)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--chart-line)" }}
            activeDot={{ r: 5 }}
            name={t(`metrics.${metric}`)}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
