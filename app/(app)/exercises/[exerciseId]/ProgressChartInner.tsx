"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export default function ProgressChartInner({
  data,
}: {
  data: { date: string; maxWeight: number; volume: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" stroke="var(--border)" tick={{ fill: "var(--muted)" }} />
          <YAxis stroke="var(--border)" tick={{ fill: "var(--muted)" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted)" }}
          />
          <Line type="monotone" dataKey="maxWeight" stroke="var(--chart-line)" name="Max Weight (kg)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
