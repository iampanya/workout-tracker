import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionDetail } from "@/lib/sessions/history";
import { Card } from "@/components/ui/Card";

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{session.name ?? "Workout"}</h1>
      <p className="text-sm text-muted">{session.session_date}</p>
      {exercises.map((exercise, i) => (
        <Card key={i}>
          <h2 className="font-medium">{exercise.exerciseName}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {exercise.sets.map((set, j) => (
              <li key={j}>
                Set {set.set_number}: {set.weight_kg}kg × {set.reps}
                {set.is_warmup ? " (warmup)" : ""}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
