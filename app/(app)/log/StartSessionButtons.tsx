"use client";

import { Play, Shuffle } from "@phosphor-icons/react/ssr";
import { routinePreview } from "@/lib/routines/preview";
import { Button } from "@/components/ui/Button";
import { useStartSession } from "./useStartSession";

export function StartSessionButtons({
  routines,
}: {
  routines: { id: string; name: string; exerciseCount: number; exerciseNames: string[] }[];
}) {
  const { start, pendingKey, error } = useStartSession();

  return (
    <div className="space-y-2">
      {routines.map((routine) => (
        <Button
          key={routine.id}
          variant="secondary"
          icon={<Play className="h-4 w-4 shrink-0" weight="fill" />}
          loading={pendingKey === routine.id}
          disabled={pendingKey !== null}
          onClick={() => start(routine)}
          className="w-full justify-start py-2 text-left"
        >
          <span className="min-w-0">
            <span className="block truncate">{routine.name}</span>
            <span className="block truncate text-xs font-normal text-muted">
              {routinePreview(routine)}
            </span>
          </span>
        </Button>
      ))}
      <Button
        variant="secondary"
        icon={<Shuffle className="h-4 w-4" />}
        loading={pendingKey === "freeform"}
        disabled={pendingKey !== null}
        onClick={() => start()}
        className="w-full border-dashed"
      >
        Freeform Workout
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
