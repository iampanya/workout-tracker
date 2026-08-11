import { notFound } from "next/navigation";
import { CalendarBlank, Clock, Trophy } from "@phosphor-icons/react/ssr";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionDetail, sessionDisplayName } from "@/lib/sessions/history";
import {
  computeSessionSummary,
  topWorkingSet,
  formatSessionDate,
  sessionDurationMinutes,
  formatDuration,
} from "@/lib/sessions/summary";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

function SummaryTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-2 py-2.5 text-center">
      <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </div>
  );
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();
  const detail = await getSessionDetail(supabase, sessionId);
  if (!detail) {
    notFound();
  }
  const { session, exercises } = detail;
  const summary = computeSessionSummary(exercises);
  const duration = sessionDurationMinutes(session.started_at, session.completed_at);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">{sessionDisplayName(session)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarBlank className="h-4 w-4" aria-hidden />
              {formatSessionDate(session.session_date)}
            </span>
            {duration !== null && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" aria-hidden />
                {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SummaryTile value={summary.exerciseCount} label="exercises" />
          <SummaryTile value={summary.setCount} label="sets" />
          <SummaryTile value={summary.totalVolumeKg.toLocaleString()} label="kg volume" />
        </div>
      </header>

      {session.notes && (
        <Card className="text-sm whitespace-pre-wrap text-muted">{session.notes}</Card>
      )}

      {exercises.length === 0 ? (
        <Card className="text-center text-sm text-muted">
          No exercises were logged in this workout.
        </Card>
      ) : (
        <div className="space-y-4">
          {exercises.map((exercise, i) => {
            const top = topWorkingSet(exercise.sets);
            return (
              <Card key={i} className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-medium">{exercise.exerciseName}</h2>
                  <span className="shrink-0 text-xs text-muted">
                    {exercise.sets.length} {exercise.sets.length === 1 ? "set" : "sets"}
                  </span>
                </div>

                {exercise.sets.length === 0 ? (
                  <p className="text-sm text-muted">No sets logged.</p>
                ) : (
                  <div>
                    <div className="grid grid-cols-[2.25rem_1fr_1fr] gap-x-3 px-2 pb-1 text-[11px] uppercase tracking-wide text-muted">
                      <span>Set</span>
                      <span className="text-right">Weight</span>
                      <span className="text-right">Reps</span>
                    </div>
                    <ul className="space-y-0.5">
                      {exercise.sets.map((set, j) => {
                        const isTop =
                          top !== null &&
                          !set.is_warmup &&
                          set.set_number === top.set_number;
                        const emphasis = set.is_warmup
                          ? "text-muted"
                          : isTop
                            ? "font-semibold text-accent"
                            : "";
                        return (
                          <li
                            key={j}
                            className={`grid grid-cols-[2.25rem_1fr_1fr] items-center gap-x-3 rounded-lg px-2 py-1.5 text-sm ${
                              set.is_warmup
                                ? "bg-surface-muted"
                                : isTop
                                  ? "bg-accent/10"
                                  : ""
                            }`}
                          >
                            <span className="tabular-nums text-muted">
                              {set.is_warmup ? (
                                <Badge tone="neutral">W</Badge>
                              ) : (
                                set.set_number
                              )}
                            </span>
                            <span className={`text-right tabular-nums ${emphasis}`}>
                              {set.weight_kg} kg
                            </span>
                            <span className={`text-right tabular-nums ${emphasis}`}>
                              {set.reps}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {top && (
                      <p className="mt-2 flex items-center gap-1.5 px-2 text-xs text-muted">
                        <Trophy className="h-3.5 w-3.5" aria-hidden />
                        Top set {top.weight_kg} kg × {top.reps}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
