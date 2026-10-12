import { getLocale, getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getTodayString } from "@/lib/date";
import { listExercises, listExerciseStats } from "@/lib/exercises/service";
import { formatRelativeDate } from "@/lib/sessions/summary";
import { ExerciseList } from "./ExerciseList";
import { NewExerciseHeader } from "./NewExercise";

export default async function ExercisesPage() {
  const user = await getAuthUser();
  const t = await getTranslations("exercises");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const [exercises, stats] = await Promise.all([
    listExercises(prisma, user!.id),
    listExerciseStats(prisma, user!.id),
  ]);

  // Formatted here, not in the client component: Node's and the browser's ICU/CLDR disagree on
  // Thai short weekdays, so formatting during SSR hydration would mismatch.
  const today = getTodayString();
  const relativeLabels = { today: tc("today"), yesterday: tc("yesterday") };
  const lastDoneLabels: Record<string, string> = {};
  for (const [id, stat] of Object.entries(stats)) {
    if (stat.lastDate) {
      lastDoneLabels[id] = formatRelativeDate(stat.lastDate, today, locale, relativeLabels);
    }
  }

  return (
    <div className="space-y-6">
      <NewExerciseHeader title={t("title")} />
      <ExerciseList exercises={exercises} stats={stats} lastDoneLabels={lastDoneLabels} />
    </div>
  );
}
