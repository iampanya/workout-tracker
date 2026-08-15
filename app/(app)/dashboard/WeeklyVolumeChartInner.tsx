"use client";

import {
  BarChart,
  Bar,
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

export default function WeeklyVolumeChartInner({
  data,
}: {
  data: { weekStart: string; volumeKg: number }[];
}) {
  const chartData = data.map((d) => ({ label: weekLabel(d.weekStart), volume: Math.round(d.volumeKg) }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" stroke="var(--border)" tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis stroke="var(--border)" tick={{ fill: "var(--muted)", fontSize: 12 }} width={44} />
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
          <Bar dataKey="volume" fill="var(--chart-line)" radius={[4, 4, 0, 0]} name="Volume (kg)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
