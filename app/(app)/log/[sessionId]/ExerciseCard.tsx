"use client";

import { useState } from "react";
import {
  CaretDown,
  ClockCounterClockwise,
  PencilSimple,
  Plus,
  Trash,
  Trophy,
} from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { formatLastSets, prefillFromLast } from "@/lib/sessions/last-session";
import {
  formatSetCount,
  formatShortDate,
  topWorkingSet,
  workingSetNumbers,
} from "@/lib/sessions/summary";
import { formatPr } from "@/lib/pr";
import { SetEditor } from "./SetEditor";
import { WarmupToggle, WeightRepsFields, isValidSetInput } from "./SetForm";
import type { ExerciseEntry, SetEntry, SetFormInput, SetValues } from "./types";

// Starting values for the "add set" form: repeat the last set logged today, else the first
// working set from last time, else blank.
function initialInput(exercise: ExerciseEntry): SetFormInput {
  const lastSet = exercise.sets[exercise.sets.length - 1];
  if (lastSet)
    return { weight: String(lastSet.weight_kg), reps: String(lastSet.reps), warmup: false };
  const prefill = prefillFromLast(exercise.lastSession);
  return prefill ? { ...prefill, warmup: false } : { weight: "", reps: "", warmup: false };
}

function LastTimeHint({ exercise }: { exercise: ExerciseEntry }) {
  const last = exercise.lastSession;
  if (!last || last.sets.length === 0) return null;
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
      <ClockCounterClockwise className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        Last · {formatShortDate(last.sessionDate)}: {formatLastSets(last.sets)}
      </span>
    </p>
  );
}

export function ExerciseCard({
  exercise,
  expanded,
  blocked,
  error,
  flashSetId,
  savingSetId,
  onExpand,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onRemove,
}: {
  exercise: ExerciseEntry;
  expanded: boolean;
  blocked: boolean;
  error: string | null;
  flashSetId: string | null;
  savingSetId: string | null;
  onExpand: () => void;
  onAddSet: (values: SetValues) => void;
  onUpdateSet: (set: SetEntry, values: SetValues) => Promise<boolean>;
  onDeleteSet: (set: SetEntry) => void;
  onRemove: () => void;
}) {
  const [input, setInput] = useState<SetFormInput>(() => initialInput(exercise));
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  const workingSets = exercise.sets.filter((s) => !s.is_warmup).length;
  const hasPendingSet = exercise.sets.some((s) => s.pending);
  const top = topWorkingSet(exercise.sets);
  const setNumbers = workingSetNumbers(exercise.sets);
  const ringClass = blocked ? "ring-2 ring-danger" : "";

  const progress =
    exercise.targetSets !== null ? (
      <Badge tone={workingSets >= exercise.targetSets ? "success" : "neutral"}>
        {workingSets}/{exercise.targetSets} sets
      </Badge>
    ) : null;

  if (!expanded) {
    return (
      <Card padding={false} className={ringClass}>
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          className="flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium">
              <span className="truncate">{exercise.exerciseName}</span>
              {progress}
            </span>
            <span className="block truncate text-sm text-muted">
              {exercise.sets.length > 0
                ? `${formatSetCount(exercise.sets)}${
                    top ? ` · top ${top.weight_kg}×${top.reps}` : ""
                  }`
                : exercise.lastSession && exercise.lastSession.sets.length > 0
                  ? `Not started · last ${formatLastSets(exercise.lastSession.sets)}`
                  : "Not started"}
            </span>
            {blocked && (
              <span className="block text-sm text-danger">Add a set or remove this exercise.</span>
            )}
          </span>
          <CaretDown className="h-4 w-4 shrink-0 text-muted" />
        </button>
      </Card>
    );
  }

  return (
    <Card className={ringClass}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">{exercise.exerciseName}</h2>
            {progress}
            {exercise.pr !== null && (
              <Badge tone="success" icon={<Trophy className="h-3 w-3" />}>
                PR {formatPr(exercise.pr)}
              </Badge>
            )}
          </div>
          <LastTimeHint exercise={exercise} />
        </div>
        <IconButton
          icon={<Trash className="h-4 w-4" />}
          aria-label={`Remove ${exercise.exerciseName}`}
          variant="danger"
          onClick={onRemove}
          className="-mr-2 -mt-2 shrink-0"
        />
      </div>

      {blocked && (
        <p className="mt-1 text-sm text-danger">
          Add a set or remove this exercise before finishing.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {exercise.sets.length > 0 && (
        <div className="mt-3">
          <div className="grid grid-cols-[2.25rem_1fr_1fr_1.25rem] gap-x-3 px-2 pb-1 text-[11px] uppercase tracking-wide text-muted">
            <span>Set</span>
            <span className="text-right">Weight</span>
            <span className="text-right">Reps</span>
            <span aria-hidden />
          </div>
          <ul className="space-y-0.5">
            {exercise.sets.map((set, i) => (
              <li key={set.id} className={set.pending ? "opacity-50" : ""}>
                {editingSetId === set.id ? (
                  <SetEditor
                    set={set}
                    setNumber={setNumbers[i]}
                    saving={savingSetId === set.id}
                    onCancel={() => setEditingSetId(null)}
                    onDelete={() => {
                      setEditingSetId(null);
                      onDeleteSet(set);
                    }}
                    onSave={async (values) => {
                      if (await onUpdateSet(set, values)) setEditingSetId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={set.pending}
                    onClick={() => setEditingSetId(set.id)}
                    aria-label={`Edit ${
                      set.is_warmup ? "warmup set" : `set ${setNumbers[i]}`
                    }: ${set.weight_kg} kg × ${set.reps}`}
                    className={`grid min-h-11 w-full grid-cols-[2.25rem_1fr_1fr_1.25rem] items-center gap-x-3 rounded-lg px-2 text-sm transition-colors duration-700 [touch-action:manipulation] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                      flashSetId === set.id ? "bg-success/15" : ""
                    } ${set.is_warmup ? "text-muted" : ""}`}
                  >
                    <span className="text-left tabular-nums text-muted">
                      {set.is_warmup ? <Badge tone="neutral">W</Badge> : setNumbers[i]}
                    </span>
                    <span className="text-right font-mono tabular-nums">{set.weight_kg} kg</span>
                    <span className="text-right font-mono tabular-nums">{set.reps}</span>
                    <PencilSimple className="h-3.5 w-3.5 text-muted" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className={`mt-3 flex flex-col gap-3 ${
          exercise.sets.length > 0 ? "border-t border-border pt-3" : ""
        }`}
      >
        <WeightRepsFields value={input} onChange={setInput} />
        <div className="flex items-center justify-between gap-2">
          <WarmupToggle
            checked={input.warmup}
            onChange={(warmup) => setInput((prev) => ({ ...prev, warmup }))}
          />
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            loading={hasPendingSet}
            disabled={!isValidSetInput(input)}
            onClick={() => {
              onAddSet({
                weightKg: Number(input.weight),
                reps: Number(input.reps),
                isWarmup: input.warmup,
              });
              setInput((prev) => ({ ...prev, warmup: false }));
            }}
          >
            Add Set
          </Button>
        </div>
      </div>
    </Card>
  );
}
