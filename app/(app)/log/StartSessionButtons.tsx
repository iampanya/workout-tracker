"use client";

import { useRouter } from "next/navigation";
import { getLocalDateString } from "@/lib/date";
import { startSession } from "@/lib/actions/sessions";

export function StartSessionButtons({ routines }: { routines: { id: string; name: string }[] }) {
  const router = useRouter();

  async function handleStart(routineId?: string) {
    const session = await startSession({ routineId, sessionDate: getLocalDateString() });
    router.push(`/log/${session.id}`);
  }

  return (
    <div className="space-y-2">
      {routines.map((routine) => (
        <button
          key={routine.id}
          onClick={() => handleStart(routine.id)}
          className="block w-full rounded border px-4 py-3 text-left"
        >
          {routine.name}
        </button>
      ))}
      <button
        onClick={() => handleStart(undefined)}
        className="block w-full rounded border border-dashed px-4 py-3 text-left"
      >
        Freeform Workout
      </button>
    </div>
  );
}
