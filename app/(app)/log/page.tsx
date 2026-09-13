import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listRoutines } from "@/lib/routines/service";
import { StartSessionButtons } from "./StartSessionButtons";

export default async function LogPage() {
  const user = await getAuthUser();
  const routines = await listRoutines(prisma, user!.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Start a Workout</h1>
      <StartSessionButtons routines={routines.map((r) => ({ id: r.id, name: r.name }))} />
    </div>
  );
}
