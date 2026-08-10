"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteRoutine } from "@/lib/actions/routines";
import { IconButton } from "@/components/ui/IconButton";

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
      <IconButton
        icon={<Trash2 className="h-4 w-4" />}
        aria-label="Delete routine"
        variant="danger"
        loading={pending}
        onClick={handleDelete}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
