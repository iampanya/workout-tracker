"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { archiveExercise } from "@/lib/actions/exercises";
import { IconButton } from "@/components/ui/IconButton";

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
      <IconButton
        icon={<Archive className="h-4 w-4" />}
        aria-label="Archive exercise"
        loading={pending}
        onClick={handleArchive}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
