"use client";

import { useState } from "react";
import { CaretUp, CaretDown, Minus, Plus, X } from "@phosphor-icons/react/ssr";
import {
  removeRoutineExercise,
  moveRoutineExercise,
  updateRoutineExerciseTargetSets,
} from "@/lib/actions/routines";
import { IconButton } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type PendingAction = "up" | "down" | "remove" | "target" | null;

const MAX_TARGET_SETS = 20;

export function RoutineExerciseRow({
  routineId,
  routineExerciseId,
  name,
  muscleGroup,
  targetSets,
  isFirst,
  isLast,
}: {
  routineId: string;
  routineExerciseId: string;
  name: string;
  muscleGroup: string | null;
  targetSets: number | null;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Optimistic target so rapid taps feel instant; the server value replaces it on revalidate.
  const [target, setTarget] = useState(targetSets);

  async function run(
    action: Exclude<PendingAction, null>,
    fn: () => Promise<void>,
    fallback: string
  ) {
    setPending(action);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
      return false;
    } finally {
      setPending(null);
    }
  }

  async function changeTarget(delta: number) {
    const previous = target;
    // Stepping below 1 clears the target ("—"); stepping up from none starts at 1.
    const next =
      previous === null
        ? delta > 0
          ? 1
          : null
        : previous + delta < 1
          ? null
          : Math.min(MAX_TARGET_SETS, previous + delta);
    if (next === previous) return;
    setTarget(next);
    const ok = await run(
      "target",
      () => updateRoutineExerciseTargetSets(routineExerciseId, routineId, next),
      "Failed to update target sets"
    );
    if (!ok) setTarget(previous);
  }

  const busy = pending !== null && pending !== "target";

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          {muscleGroup && <p className="text-xs text-muted">{muscleGroup}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton
            icon={<CaretUp className="h-4 w-4" />}
            aria-label={`Move ${name} up`}
            loading={pending === "up"}
            disabled={isFirst || busy}
            onClick={() =>
              run(
                "up",
                () => moveRoutineExercise(routineExerciseId, routineId, "up"),
                "Failed to move exercise"
              )
            }
          />
          <IconButton
            icon={<CaretDown className="h-4 w-4" />}
            aria-label={`Move ${name} down`}
            loading={pending === "down"}
            disabled={isLast || busy}
            onClick={() =>
              run(
                "down",
                () => moveRoutineExercise(routineExerciseId, routineId, "down"),
                "Failed to move exercise"
              )
            }
          />
          <IconButton
            icon={<X className="h-4 w-4" />}
            aria-label={`Remove ${name} from routine`}
            variant="danger"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-sm text-muted">Target sets</span>
        <div className="flex items-center gap-1">
          <IconButton
            icon={<Minus className="h-4 w-4" />}
            aria-label={`Fewer target sets for ${name}`}
            disabled={target === null}
            onClick={() => changeTarget(-1)}
          />
          <span className="w-8 text-center font-mono text-lg tabular-nums" aria-live="polite">
            {target ?? "—"}
          </span>
          <IconButton
            icon={<Plus className="h-4 w-4" />}
            aria-label={`More target sets for ${name}`}
            disabled={target !== null && target >= MAX_TARGET_SETS}
            onClick={() => changeTarget(1)}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove from routine?"
        description={`"${name}" will be removed from this routine. Past workouts aren't affected.`}
        confirmLabel="Remove"
        tone="danger"
        loading={pending === "remove"}
        onConfirm={async () => {
          const ok = await run(
            "remove",
            () => removeRoutineExercise(routineExerciseId, routineId),
            "Failed to remove exercise"
          );
          if (ok) setConfirmRemove(false);
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
