import { useTranslations } from "next-intl";
import { routinePreviewNames } from "@/lib/routines/preview";

// "5 exercises · Bench Press, Squat, Row…" or "No exercises yet". No directive: it renders as a
// server component on the routines index and as a client component inside StartSessionButtons.
export function RoutinePreviewText({
  routine,
}: {
  routine: { exerciseCount: number; exerciseNames: string[] };
}) {
  const t = useTranslations("common");
  const names = routinePreviewNames(routine);
  if (names === null) return <>{t("noExercisesYet")}</>;
  return (
    <>
      {t("exercises", { count: routine.exerciseCount })} · {names}
    </>
  );
}
