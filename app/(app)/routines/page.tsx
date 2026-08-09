import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listRoutines } from "@/lib/routines/service";
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
      <ul className="divide-y">
        {routines.map((routine) => (
          <li key={routine.id} className="flex items-center justify-between py-2">
            <Link href={`/routines/${routine.id}`} className="underline">
              {routine.name}
            </Link>
            <DeleteRoutineButton routineId={routine.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
