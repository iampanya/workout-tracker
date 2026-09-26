import { estimateOneRepMax } from "./pr";

export type SetForAggregation = {
  session_date: string;
  weight_kg: number;
  reps: number;
};

export type SessionSeriesPoint = {
  date: string;
  maxWeight: number;
  volume: number;
  // Best estimated one-rep max of the day (Epley), see estimateOneRepMax.
  e1rm: number;
};

export function aggregateSessionSeries(sets: SetForAggregation[]): SessionSeriesPoint[] {
  const byDate = new Map<string, { maxWeight: number; volume: number; e1rm: number }>();

  for (const set of sets) {
    const existing = byDate.get(set.session_date) ?? { maxWeight: 0, volume: 0, e1rm: 0 };
    existing.maxWeight = Math.max(existing.maxWeight, set.weight_kg);
    existing.volume += set.weight_kg * set.reps;
    existing.e1rm = Math.max(existing.e1rm, estimateOneRepMax(set.weight_kg, set.reps));
    byDate.set(set.session_date, existing);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, agg]) => ({ date, ...agg }));
}
