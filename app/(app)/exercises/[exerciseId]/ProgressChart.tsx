"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export function ProgressChart({ data }: { data: { date: string; maxWeight: number; volume: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="maxWeight" stroke="#000000" name="Max Weight (kg)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
