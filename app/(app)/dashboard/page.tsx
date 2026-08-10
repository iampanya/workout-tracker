import Link from "next/link";
import { Play, Trophy } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listInProgressSessions, listPrsFromLastCompletedSession } from "@/lib/dashboard/service";
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
        className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground"
      >
        <Play className="h-4 w-4" />
        Start a Workout
      </Link>

      {inProgress.length > 0 && (
        <section>
          <h2 className="font-medium">In Progress</h2>
          <ul className="divide-y divide-border">
            {inProgress.map((session) => (
              <li key={session.id} className="flex items-center justify-between py-2">
                <Link href={`/log/${session.id}`} className="underline">
                  {session.name ?? "Workout"} — {session.session_date}
                </Link>
                <DiscardSessionButton sessionId={session.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recentPrs.length > 0 && (
        <section>
          <h2 className="font-medium">Top lifts from your last workout</h2>
          <ul className="space-y-1">
            {recentPrs.map((pr) => (
              <li
                key={pr.exerciseName}
                className="flex items-center gap-2 rounded-xl bg-warning/15 px-3 py-2"
              >
                <Trophy className="h-4 w-4 text-warning" />
                {pr.exerciseName}: {pr.weightKg}kg
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
