import { getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getLocalDateString } from "@/lib/date";
import { listExercises, listExerciseStats } from "@/lib/exercises/service";
import { ExerciseList } from "./ExerciseList";
import { NewExerciseHeader } from "./NewExercise";

export default async function ExercisesPage() {
  const user = await getAuthUser();
  const t = await getTranslations("exercises");
  const [exercises, stats] = await Promise.all([
    listExercises(prisma, user!.id),
    listExerciseStats(prisma, user!.id),
  ]);

  return (
    <div className="space-y-6">
      <NewExerciseHeader title={t("title")} />
      <ExerciseList exercises={exercises} stats={stats} today={getLocalDateString()} />
    </div>
  );
}
