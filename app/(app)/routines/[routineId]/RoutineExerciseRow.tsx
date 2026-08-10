"use client";

import { useState } from "react";
import { CaretUp, CaretDown, X } from "@phosphor-icons/react/ssr";
import { removeRoutineExercise, moveRoutineExercise } from "@/lib/actions/routines";
import { IconButton } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";

type PendingAction = "up" | "down" | "remove" | null;

export function RoutineExerciseRow({
  routineId,
  routineExerciseId,
  name,
}: {
  routineId: string;
  routineExerciseId: string;
  name: string;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMove(direction: "up" | "down") {
    setPending(direction);
    setError(null);
    try {
      await moveRoutineExercise(routineExerciseId, routineId, direction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move exercise");
    } finally {
      setPending(null);
    }
  }

  async function handleRemove() {
    setPending("remove");
    setError(null);
    try {
      await removeRoutineExercise(routineExerciseId, routineId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove exercise");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="font-medium">{name}</span>
        <div className="flex items-center gap-1">
          <IconButton
            icon={<CaretUp className="h-4 w-4" />}
            aria-label="Move exercise up"
            loading={pending === "up"}
            disabled={pending !== null && pending !== "up"}
            onClick={() => handleMove("up")}
          />
          <IconButton
            icon={<CaretDown className="h-4 w-4" />}
            aria-label="Move exercise down"
            loading={pending === "down"}
            disabled={pending !== null && pending !== "down"}
            onClick={() => handleMove("down")}
          />
          <IconButton
            icon={<X className="h-4 w-4" />}
            aria-label="Remove exercise from routine"
            variant="danger"
            loading={pending === "remove"}
            disabled={pending !== null && pending !== "remove"}
            onClick={handleRemove}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
