"use client";

import { deleteRoutine } from "@/lib/actions/routines";

export function DeleteRoutineButton({ routineId }: { routineId: string }) {
  return (
    <button onClick={() => deleteRoutine(routineId)} className="text-sm text-gray-500 underline">
      Delete
    </button>
  );
}
