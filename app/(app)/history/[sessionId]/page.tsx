import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionDetail } from "@/lib/sessions/history";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();
  const { session, exercises } = await getSessionDetail(supabase, sessionId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{session.name ?? "Workout"}</h1>
      <p className="text-sm text-gray-500">{session.session_date}</p>
      {exercises.map((exercise, i) => (
        <div key={i} className="rounded border p-4">
          <h2 className="font-medium">{exercise.exerciseName}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {exercise.sets.map((set, j) => (
              <li key={j}>
                Set {set.set_number}: {set.weight_kg}kg × {set.reps}
                {set.is_warmup ? " (warmup)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
