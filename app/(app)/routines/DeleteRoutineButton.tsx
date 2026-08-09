"use client";

import { useState } from "react";
import { deleteRoutine } from "@/lib/actions/routines";

export function DeleteRoutineButton({ routineId }: { routineId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      await deleteRoutine(routineId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete routine");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={pending}
        className="text-sm text-gray-500 underline disabled:opacity-50"
      >
        {pending ? "Deleting..." : "Delete"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
