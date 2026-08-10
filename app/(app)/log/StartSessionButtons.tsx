"use client";

import { useRouter } from "next/navigation";
import { Play, Shuffle } from "lucide-react";
import { getLocalDateString } from "@/lib/date";
import { startSession } from "@/lib/actions/sessions";
import { Button } from "@/components/ui/Button";

export function StartSessionButtons({ routines }: { routines: { id: string; name: string }[] }) {
  const router = useRouter();

  async function handleStart(routineId?: string) {
    const session = await startSession({ routineId, sessionDate: getLocalDateString() });
    router.push(`/log/${session.id}`);
  }

  return (
    <div className="space-y-2">
      {routines.map((routine) => (
        <Button
          key={routine.id}
          variant="secondary"
          icon={<Play className="h-4 w-4" />}
          onClick={() => handleStart(routine.id)}
          className="w-full"
        >
          {routine.name}
        </Button>
      ))}
      <Button
        variant="secondary"
        icon={<Shuffle className="h-4 w-4" />}
        onClick={() => handleStart(undefined)}
        className="w-full border-dashed"
      >
        Freeform Workout
      </Button>
    </div>
  );
}
