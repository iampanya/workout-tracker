import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartLine, Trophy } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getLocalDateString } from "@/lib/date";
import {
  getExerciseHistory,
  getExercisePr,
  type ExerciseHistorySet,
} from "@/lib/exercises/progress";
import { aggregateSessionSeries } from "@/lib/progress";
import { estimateOneRepMax } from "@/lib/pr";
import { formatRelativeDate } from "@/lib/sessions/summary";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { ProgressChart } from "./ProgressChart";

// Sets (chronological) → one entry per session, newest first (two sessions on the same day keep
// their logged order, reversed), sets in logged order.
function groupBySession(history: ExerciseHistorySet[]) {
  const groups = new Map<string, { sessionId: string; date: string; sets: ExerciseHistorySet[] }>();
  for (const set of history) {
    const group = groups.get(set.session_id) ?? {
      sessionId: set.session_id,
      date: set.session_date,
      sets: [],
    };
    group.sets.push(set);
    groups.set(set.session_id, group);
  }
  return [...groups.values()]
    .reverse()
    .map((group) => ({ ...group, sets: group.sets.sort((a, b) => a.set_number - b.set_number) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const userId = (await getAuthUser())!.id;

  // Independent reads, run in parallel. The exercise lookup is scoped to presets + the user's
  // own (replaces RLS), so another user's custom exercise resolves to null.
  const [exercise, history, pr] = await Promise.all([
    prisma.exercises.findFirst({
      where: { id: exerciseId, OR: [{ user_id: null }, { user_id: userId }] },
      select: { name: true, muscle_group: true },
    }),
    getExerciseHistory(prisma, userId, exerciseId),
    getExercisePr(prisma, userId, exerciseId),
  ]);
  if (!exercise) {
    notFound();
  }
  const series = aggregateSessionSeries(history.filter((s) => !s.is_warmup));
  const bestE1rm = series.reduce((best, point) => Math.max(best, point.e1rm), 0);
  const sessions = groupBySession(history);
  const today = getLocalDateString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{exercise.name}</h1>
        {exercise.muscle_group && <p className="text-sm text-muted">{exercise.muscle_group}</p>}
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={<ChartLine className="h-6 w-6" />}
          title="No sets logged yet"
          description="Log this exercise in a workout and your progress chart and history will show up here."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="PR"
              value={pr ?? "—"}
              unit={pr !== null ? "kg" : undefined}
              tone="success"
              icon={<Trophy className="h-4 w-4" />}
            />
            <StatCard
              label="Best e1RM"
              value={bestE1rm > 0 ? bestE1rm : "—"}
              unit={bestE1rm > 0 ? "kg" : undefined}
            />
            <StatCard label="Sessions" value={sessions.length} />
          </div>

          {series.length > 0 && (
            <Card>
              <ProgressChart data={series} />
            </Card>
          )}

          <section className="space-y-2">
            <h2 className="font-medium">History</h2>
            {sessions.map((session) => {
              const working = session.sets.filter((s) => !s.is_warmup);
              const best = working.reduce<ExerciseHistorySet | null>(
                (top, set) =>
                  top === null ||
                  set.weight_kg > top.weight_kg ||
                  (set.weight_kg === top.weight_kg && set.reps > top.reps)
                    ? set
                    : top,
                null
              );
              const sessionE1rm = working.reduce(
                (max, set) => Math.max(max, estimateOneRepMax(set.weight_kg, set.reps)),
                0
              );
              return (
                <Card key={session.sessionId} padding={false}>
                  <Link
                    href={`/history/${session.sessionId}`}
                    className="block space-y-2 rounded-2xl p-4 [touch-action:manipulation] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{formatRelativeDate(session.date, today)}</span>
                      {sessionE1rm > 0 && (
                        <span className="text-xs text-muted tabular-nums">
                          e1RM {sessionE1rm} kg
                        </span>
                      )}
                    </div>
                    <ul className="flex flex-wrap gap-1.5">
                      {session.sets.map((set) => {
                        const isPr = !set.is_warmup && pr !== null && set.weight_kg === pr;
                        const isBest = set === best;
                        return (
                          <li
                            key={set.id}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-sm tabular-nums ${
                              set.is_warmup
                                ? "bg-surface-muted text-muted"
                                : isPr
                                  ? "bg-success/15 font-semibold text-success"
                                  : isBest
                                    ? "bg-accent/10 font-semibold text-accent"
                                    : "bg-surface-muted text-foreground"
                            }`}
                          >
                            {isPr && (
                              <Trophy className="h-3.5 w-3.5" weight="fill" aria-label="PR" />
                            )}
                            {set.is_warmup && <span className="font-sans text-xs">W</span>}
                            {set.weight_kg}×{set.reps}
                          </li>
                        );
                      })}
                    </ul>
                  </Link>
                </Card>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
