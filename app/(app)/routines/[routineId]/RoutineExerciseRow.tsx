"use client";

import { useState } from "react";
import { removeRoutineExercise, moveRoutineExercise } from "@/lib/actions/routines";

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
    <li className="py-2">
      <div className="flex items-center justify-between">
        <span>{name}</span>
        <div className="flex gap-2 text-sm">
          <button onClick={() => handleMove("up")} disabled={pending !== null}>
            ↑
          </button>
          <button onClick={() => handleMove("down")} disabled={pending !== null}>
            ↓
          </button>
          <button
            onClick={handleRemove}
            disabled={pending !== null}
            className="text-gray-500 underline disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </li>
  );
}
