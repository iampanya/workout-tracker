"use client";

import { useState } from "react";
import { archiveExercise } from "@/lib/actions/exercises";

export function ArchiveExerciseButton({ exerciseId }: { exerciseId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setPending(true);
    setError(null);
    try {
      await archiveExercise(exerciseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive exercise");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleArchive}
        disabled={pending}
        className="text-sm text-gray-500 underline disabled:opacity-50"
      >
        {pending ? "Archiving..." : "Archive"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
