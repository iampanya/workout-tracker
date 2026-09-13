import { Trophy } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getExerciseHistory, getExercisePr } from "@/lib/exercises/progress";
import { aggregateSessionSeries } from "@/lib/progress";
import { Card } from "@/components/ui/Card";
import { ProgressChart } from "./ProgressChart";

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
      select: { name: true },
    }),
    getExerciseHistory(prisma, userId, exerciseId),
    getExercisePr(prisma, userId, exerciseId),
  ]);
  const series = aggregateSessionSeries(history.filter((s) => !s.is_warmup));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{exercise?.name}</h1>
      {pr !== null && (
        <div className="flex items-center gap-2 rounded-xl bg-success/15 px-3 py-2 font-medium text-success">
          <Trophy className="h-5 w-5" />
          PR: {pr}kg
        </div>
      )}
      <Card>
        <ProgressChart data={series} />
      </Card>
      <Card padding={false} className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Weight</th>
              <th className="px-4 py-3 font-medium">Reps</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-mono">
            {history
              .slice()
              .reverse()
              .map((set) => (
                <tr
                  key={set.id}
                  className={set.weight_kg === pr && !set.is_warmup ? "font-semibold text-success" : ""}
                >
                  <td className="px-4 py-3">{set.session_date}</td>
                  <td className="px-4 py-3">
                    {set.weight_kg}kg{set.is_warmup ? " (warmup)" : ""}
                  </td>
                  <td className="px-4 py-3">{set.reps}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
