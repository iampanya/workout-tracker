import Link from "next/link";
import { Play, Trophy } from "@phosphor-icons/react/ssr";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listInProgressSessions, listPrsFromLastCompletedSession } from "@/lib/dashboard/service";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { DiscardSessionButton } from "./DiscardSessionButton";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [inProgress, recentPrs] = await Promise.all([
    listInProgressSessions(supabase),
    listPrsFromLastCompletedSession(supabase, user!.id),
  ]);

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
                  <div className="font-medium">{session.name ?? "Workout"}</div>
                  <div className="text-sm text-muted">{session.session_date}</div>
                </Link>
                <DiscardSessionButton sessionId={session.id} />
              </Card>
            ))}
          </div>
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
    </div>
  );
}
