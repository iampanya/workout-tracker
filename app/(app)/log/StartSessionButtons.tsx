"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Shuffle } from "@phosphor-icons/react/ssr";
import { getLocalDateString } from "@/lib/date";
import { startSession } from "@/lib/actions/sessions";
import { Button } from "@/components/ui/Button";

const FREEFORM_KEY = "freeform";

export function StartSessionButtons({ routines }: { routines: { id: string; name: string }[] }) {
  const router = useRouter();
  // One start at a time: every button is disabled while a session is being created, so a
  // double tap can't create two sessions. Left set on success — we're navigating away.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStart(routine?: { id: string; name: string }) {
    if (pendingKey !== null) return;
    setPendingKey(routine?.id ?? FREEFORM_KEY);
    setError(null);
    try {
      const session = await startSession({
        routineId: routine?.id,
        name: routine?.name,
        sessionDate: getLocalDateString(),
      });
      router.push(`/log/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start workout");
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-2">
      {routines.map((routine) => (
        <Button
          key={routine.id}
          variant="secondary"
          icon={<Play className="h-4 w-4" />}
          loading={pendingKey === routine.id}
          disabled={pendingKey !== null}
          onClick={() => handleStart(routine)}
          className="w-full"
        >
          {routine.name}
        </Button>
      ))}
      <Button
        variant="secondary"
        icon={<Shuffle className="h-4 w-4" />}
        loading={pendingKey === FREEFORM_KEY}
        disabled={pendingKey !== null}
        onClick={() => handleStart(undefined)}
        className="w-full border-dashed"
      >
        Freeform Workout
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
