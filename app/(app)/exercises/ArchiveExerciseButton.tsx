"use client";

import { archiveExercise } from "@/lib/actions/exercises";

export function ArchiveExerciseButton({ exerciseId }: { exerciseId: string }) {
  return (
    <button onClick={() => archiveExercise(exerciseId)} className="text-sm text-gray-500 underline">
      Archive
    </button>
  );
}
