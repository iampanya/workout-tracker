import { ArrowRight } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listRoutines } from "@/lib/routines/service";
import { getInProgressSessions } from "@/lib/dashboard/current";
import { sessionDisplayName } from "@/lib/sessions/history";
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Start a Workout</h1>
      {current && (
        <Card className="flex flex-col gap-3 border-accent/40 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">You have a workout in progress</p>
            <p className="text-sm text-muted">
              {sessionDisplayName(current)} · {current.session_date}
            </p>
          </div>
          <ButtonLink href={`/log/${current.id}`}>
            Resume
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
