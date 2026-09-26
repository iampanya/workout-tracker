import Link from "next/link";
import { CaretRight, ListChecks } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listRoutines } from "@/lib/routines/service";
import { routinePreview } from "@/lib/routines/preview";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateRoutineForm } from "./CreateRoutineForm";
import { DeleteRoutineButton } from "./DeleteRoutineButton";
import { StartRoutineButton } from "./StartRoutineButton";

export default async function RoutinesPage() {
  const user = await getAuthUser();
  const routines = await listRoutines(prisma, user!.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Routines</h1>
      <CreateRoutineForm />
      {routines.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-6 w-6" />}
          title="No routines yet"
          description="Create one above to line up your exercises before a workout."
        />
      ) : (
        <div className="space-y-2">
          {routines.map((routine) => (
            <Card key={routine.id} padding={false} className="flex items-center gap-1 pr-2">
              <Link
                href={`/routines/${routine.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 p-4"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{routine.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {routinePreview(routine)}
                  </span>
                </span>
                <CaretRight className="h-4 w-4 shrink-0 text-muted" />
              </Link>
              {routine.exerciseCount > 0 && (
                <StartRoutineButton routine={{ id: routine.id, name: routine.name }} />
              )}
              <DeleteRoutineButton routineId={routine.id} routineName={routine.name} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
