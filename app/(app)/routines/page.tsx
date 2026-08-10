import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listRoutines } from "@/lib/routines/service";
import { Card } from "@/components/ui/Card";
import { CreateRoutineForm } from "./CreateRoutineForm";
import { DeleteRoutineButton } from "./DeleteRoutineButton";

export default async function RoutinesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const routines = await listRoutines(supabase, user!.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Routines</h1>
      <CreateRoutineForm />
      <div className="space-y-2">
        {routines.map((routine) => (
          <Card key={routine.id} padding={false} className="flex items-center justify-between gap-2">
            <Link href={`/routines/${routine.id}`} className="flex flex-1 items-center justify-between gap-2 p-4">
              <span>{routine.name}</span>
              <CaretRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
            <div className="pr-2">
              <DeleteRoutineButton routineId={routine.id} routineName={routine.name} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
