import Link from "next/link";
import { Play, Trophy, Fire, CalendarCheck, Barbell, CaretRight } from "@phosphor-icons/react/ssr";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  listInProgressSessions,
  listPrsFromLastCompletedSession,
  getOverviewStats,
  getWeeklyVolume,
  listTopPrs,
} from "@/lib/dashboard/service";
import { listCompletedSessions, sessionDisplayName } from "@/lib/sessions/history";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { DiscardSessionButton } from "./DiscardSessionButton";
import { WeeklyVolumeChart } from "./WeeklyVolumeChart";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [inProgress, recentPrs, overview, weeklyVolume, topPrs, recentSessions] = await Promise.all([
    listInProgressSessions(supabase),
    listPrsFromLastCompletedSession(supabase, user!.id),
    getOverviewStats(supabase, user!.id),
    getWeeklyVolume(supabase, user!.id),
    listTopPrs(supabase, user!.id),
    listCompletedSessions(supabase),
  ]);
  const recentWorkouts = recentSessions.slice(0, 5);
  const hasWeeklyVolume = weeklyVolume.some((w) => w.volumeKg > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Link
        href="/log"
        className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground transition [touch-action:manipulation] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Play className="h-5 w-5" />
        Start a Workout
      </Link>

      {inProgress.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">In Progress</h2>
          <div className="space-y-2">
            {inProgress.map((session) => (
              <Card key={session.id} className="flex items-center justify-between">
                <Link href={`/log/${session.id}`} className="flex-1 py-1">
                  <div className="font-medium">{sessionDisplayName(session)}</div>
                  <div className="text-sm text-muted">{session.session_date}</div>
                </Link>
                <DiscardSessionButton sessionId={session.id} />
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Overview</h2>
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label="Streak"
            value={overview.streakDays}
            unit={overview.streakDays === 1 ? "day" : "days"}
            icon={<Fire className="h-4 w-4" />}
            tone={overview.streakDays > 0 ? "success" : "neutral"}
          />
          <StatCard
            label="This week"
            value={overview.sessionsThisWeek}
            unit={overview.sessionsThisWeek === 1 ? "session" : "sessions"}
            icon={<CalendarCheck className="h-4 w-4" />}
          />
          <StatCard
            label="Volume"
            value={Math.round(overview.volumeThisWeekKg).toLocaleString()}
            unit="kg"
            icon={<Barbell className="h-4 w-4" />}
          />
        </div>
      </section>

      {hasWeeklyVolume && (
        <section className="space-y-2">
          <h2 className="font-medium">Weekly volume</h2>
          <Card>
            <WeeklyVolumeChart data={weeklyVolume} />
          </Card>
        </section>
      )}

      {recentPrs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Top lifts from your last workout</h2>
          <div className="grid grid-cols-2 gap-3">
            {recentPrs.map((pr) => (
              <StatCard
                key={pr.exerciseName}
                label={pr.exerciseName}
                value={pr.weightKg}
                unit="kg"
                tone="success"
                icon={<Trophy className="h-4 w-4" />}
              />
            ))}
          </div>
        </section>
      )}

      {topPrs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Personal records</h2>
          <div className="grid grid-cols-2 gap-3">
            {topPrs.map((pr) => (
              <StatCard
                key={pr.exerciseName}
                label={pr.exerciseName}
                value={pr.weightKg}
                unit="kg"
                icon={<Trophy className="h-4 w-4" />}
              />
            ))}
          </div>
        </section>
      )}

      {recentWorkouts.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Recent workouts</h2>
          <div className="space-y-2">
            {recentWorkouts.map((session) => (
              <Card key={session.id} padding={false}>
                <Link
                  href={`/history/${session.id}`}
                  className="flex items-center justify-between gap-2 p-4"
                >
                  <span>
                    <span className="font-medium">{sessionDisplayName(session)}</span>
                    <span className="block text-sm text-muted">{session.session_date}</span>
                  </span>
                  <CaretRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
