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

// weekStart is a YYYY-MM-DD Monday; label it as M/D for a compact axis.
function weekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split("-");
  return `${Number(month)}/${Number(day)}`;
}

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
  const chartData = data.map((d) => ({
    label: d.weekStart === currentWeekStart ? "This wk" : weekLabel(d.weekStart),
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
            cursor={{ fill: "var(--surface-muted)" }}
            contentStyle={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted)" }}
            formatter={(value) => [`${Number(value).toLocaleString()} kg`, "Volume"]}
          />
          <Bar dataKey="volume" radius={[4, 4, 0, 0]} name="Volume (kg)">
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
