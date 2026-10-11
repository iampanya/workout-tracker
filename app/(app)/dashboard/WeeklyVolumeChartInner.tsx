"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { formatAxisDate } from "@/lib/sessions/summary";

// 12400 -> "12.4k" so the axis stays narrow on phones.
function compactKg(value: number): string {
  return value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value);
}

export default function WeeklyVolumeChartInner({
  data,
  currentWeekStart,
}: {
  data: { weekStart: string; volumeKg: number }[];
  currentWeekStart: string;
}) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const chartData = data.map((d) => ({
    label: d.weekStart === currentWeekStart ? t("chartThisWeek") : formatAxisDate(d.weekStart, locale),
    volume: Math.round(d.volumeKg),
    current: d.weekStart === currentWeekStart,
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--border)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="var(--border)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={compactKg}
            width={40}
          />
          <Tooltip
            separator=": "
            cursor={{ fill: "var(--surface-muted)" }}
            contentStyle={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted)" }}
            formatter={(value) => [`${format.number(Number(value))} kg`, t("volume")]}
          />
          <Bar dataKey="volume" radius={[4, 4, 0, 0]} name={t("chartVolumeSeries")}>
            {chartData.map((point) => (
              <Cell
                key={point.label}
                fill="var(--chart-line)"
                fillOpacity={point.current ? 1 : 0.55}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
