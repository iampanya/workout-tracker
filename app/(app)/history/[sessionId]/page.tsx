import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarBlank,
  CaretRight,
  CheckCircle,
  Clock,
  House,
  Trophy,
} from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getSessionDetail, getPreviousRoutineSession, sessionDisplayName } from "@/lib/sessions/history";
import { getSessionPrs } from "@/lib/sessions/service";
import {
  computeSessionSummary,
  topWorkingSet,
  formatSessionDate,
  sessionDurationMinutes,
  formatDuration,
} from "@/lib/sessions/summary";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";

function SummaryTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-2 py-2.5 text-center">
      <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

// "+8% vs last time (Sep 19)" — the volume change against the routine's previous run.
function VolumeComparison({
  volumeKg,
  previous,
}: {
  volumeKg: number;
  previous: { sessionDate: string; volumeKg: number };
}) {
  if (previous.volumeKg <= 0) return null;
  const change = Math.round(((volumeKg - previous.volumeKg) / previous.volumeKg) * 100);
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`flex items-center gap-1 text-sm ${up ? "text-success" : "text-muted"}`}>
      <Icon className="h-4 w-4" aria-hidden />
      <span>
        {up ? "+" : ""}
        {change}% volume vs last time ({formatSessionDate(previous.sessionDate)})
      </span>
    </p>
  );
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ sessionId }, query] = await Promise.all([params, searchParams]);
  const justFinished = query.finished === "1";
  const user = await getAuthUser();
  const [detail, prs, previous] = await Promise.all([
    getSessionDetail(prisma, user!.id, sessionId),
    getSessionPrs(prisma, user!.id, sessionId),
    getPreviousRoutineSession(prisma, user!.id, sessionId),
  ]);
  if (!detail) {
    notFound();
  }
  const { session, exercises } = detail;
  const summary = computeSessionSummary(exercises);
  const duration = sessionDurationMinutes(session.started_at, session.completed_at);
  const prByExercise = new Map(prs.map((pr) => [pr.exerciseId, pr]));

  return (
    <div className="space-y-6">
      {justFinished && (
        <Card className="flex flex-col gap-3 border-success/40 bg-success/10">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
              <CheckCircle className="h-6 w-6" weight="fill" />
            </span>
            <div>
              <p className="text-lg font-semibold">Workout complete</p>
              <p className="text-sm text-muted">
                {prs.length > 0
                  ? `Nice work — ${prs.length} new ${prs.length === 1 ? "PR" : "PRs"} today.`
                  : "Nice work — it's saved to your history."}
              </p>
            </div>
          </div>
          {previous && <VolumeComparison volumeKg={summary.totalVolumeKg} previous={previous} />}
          <ButtonLink href="/dashboard" variant="secondary" icon={<House className="h-4 w-4" />}>
            Back to dashboard
          </ButtonLink>
        </Card>
      )}

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
          {!justFinished && previous && (
            <div className="mt-1">
              <VolumeComparison volumeKg={summary.totalVolumeKg} previous={previous} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SummaryTile value={summary.exerciseCount} label="exercises" />
          <SummaryTile value={summary.setCount} label="sets" />
          <SummaryTile value={summary.totalVolumeKg.toLocaleString()} label="kg volume" />
        </div>
      </header>

      {prs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">New personal records</h2>
          <div className="flex flex-wrap gap-2">
            {prs.map((pr) => (
              <Link
                key={pr.exerciseId}
                href={`/exercises/${pr.exerciseId}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-success/15 px-4 text-sm font-medium text-success [touch-action:manipulation] hover:bg-success/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trophy className="h-4 w-4" weight="fill" aria-hidden />
                {pr.exerciseName} · {pr.weightKg} kg
              </Link>
            ))}
          </div>
        </section>
      )}

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
            const pr = prByExercise.get(exercise.exerciseId);
            return (
              <Card key={i} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/exercises/${exercise.exerciseId}`}
                    className="-mx-1 flex min-h-11 min-w-0 items-center gap-1 rounded-lg px-1 font-medium [touch-action:manipulation] hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate">{exercise.exerciseName}</span>
                    <CaretRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    {pr && (
                      <Badge tone="success" icon={<Trophy className="h-3 w-3" />}>
                        PR
                      </Badge>
                    )}
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
