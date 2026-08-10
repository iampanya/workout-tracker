import { Trophy } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getExerciseHistory, getExercisePr } from "@/lib/exercises/progress";
import { aggregateSessionSeries } from "@/lib/progress";
import { ProgressChart } from "./ProgressChart";

export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: exercise } = await supabase
    .from("exercises")
    .select("name")
    .eq("id", exerciseId)
    .single();
  const history = await getExerciseHistory(supabase, exerciseId);
  const pr = await getExercisePr(supabase, user!.id, exerciseId);
  const series = aggregateSessionSeries(history.filter((s) => !s.is_warmup));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{exercise?.name}</h1>
      {pr !== null && (
        <div className="flex items-center gap-2 rounded-xl bg-warning/15 px-3 py-2 text-warning">
          <Trophy className="h-4 w-4" />
          PR: {pr}kg
        </div>
      )}
      <ProgressChart data={series} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>Date</th>
            <th>Weight</th>
            <th>Reps</th>
          </tr>
        </thead>
        <tbody>
          {history
            .slice()
            .reverse()
            .map((set) => (
              <tr key={set.id} className={set.weight_kg === pr && !set.is_warmup ? "font-semibold" : ""}>
                <td>{set.session_date}</td>
                <td>
                  {set.weight_kg}kg{set.is_warmup ? " (warmup)" : ""}
                </td>
                <td>{set.reps}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
