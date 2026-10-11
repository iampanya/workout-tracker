import { ArrowRight } from "@phosphor-icons/react/ssr";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listRoutines } from "@/lib/routines/service";
import { getInProgressSessions } from "@/lib/dashboard/current";
import { sessionDisplayName } from "@/lib/sessions/history";
import { formatSessionDate } from "@/lib/sessions/summary";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StartSessionButtons } from "./StartSessionButtons";

export default async function LogPage() {
  const user = await getAuthUser();
  const [routines, inProgress] = await Promise.all([
    listRoutines(prisma, user!.id),
    getInProgressSessions(),
  ]);
  const current = inProgress[0] ?? null;
  const [locale, tc, t] = await Promise.all([
    getLocale(),
    getTranslations("common"),
    getTranslations("log"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {current && (
        <Card className="flex flex-col gap-3 border-accent/40 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{t("inProgress")}</p>
            <p className="text-sm text-muted">
              {sessionDisplayName(current, tc("freeformWorkout"))} · {formatSessionDate(current.session_date, locale)}
            </p>
          </div>
          <ButtonLink href={`/log/${current.id}`}>
            {t("resume")}
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </Card>
      )}
      <StartSessionButtons
        routines={routines.map((r) => ({
          id: r.id,
          name: r.name,
          exerciseCount: r.exerciseCount,
          exerciseNames: r.exerciseNames,
        }))}
      />
    </div>
  );
}
