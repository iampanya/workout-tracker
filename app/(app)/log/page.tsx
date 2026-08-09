import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listRoutines } from "@/lib/routines/service";
import { StartSessionButtons } from "./StartSessionButtons";

export default async function LogPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const routines = await listRoutines(supabase, user!.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Start a Workout</h1>
      <StartSessionButtons routines={routines.map((r) => ({ id: r.id, name: r.name }))} />
    </div>
  );
}
