"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash, PencilSimple, Check, X, CheckCircle, Trophy } from "@phosphor-icons/react/ssr";
import {
  logSet,
  updateSet,
  deleteSet,
  finishSession,
  discardSession,
  addExerciseToSession,
} from "@/lib/actions/sessions";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { NumberField, applyStep } from "@/components/ui/NumberField";

type SetEntry = {
  id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
  pending?: boolean;
};
type ExerciseEntry = {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  sets: SetEntry[];
  prWeightKg: number | null;
};
type SetFormInput = { weight: string; reps: string; warmup: boolean };
type AvailableExercise = { id: string; name: string };

function buildInputsFromExercises(list: ExerciseEntry[]): Record<string, SetFormInput> {
  const result: Record<string, SetFormInput> = {};
  for (const exercise of list) {
    const lastSet = exercise.sets[exercise.sets.length - 1];
    result[exercise.sessionExerciseId] = lastSet
      ? { weight: String(lastSet.weight_kg), reps: String(lastSet.reps), warmup: false }
      : { weight: "", reps: "", warmup: false };
  }
  return result;
}

const WEIGHT_STEP = 2.5;
const REPS_STEP = 1;

function WarmupToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition [touch-action:manipulation] ${
        checked ? "bg-accent-secondary/15 text-accent-secondary" : "bg-surface-muted text-muted"
      }`}
    >
      {checked && <Check className="h-4 w-4" />}
      Warmup
    </button>
  );
}

export function LoggingClient({
  sessionId,
  sessionName,
  initialExercises,
  availableExercises,
}: {
  sessionId: string;
  sessionName: string;
  initialExercises: ExerciseEntry[];
  availableExercises: AvailableExercise[];
}) {
  const router = useRouter();
  const [exercises, setExercises] = useState(initialExercises);
  const [prBanner, setPrBanner] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, SetFormInput>>(() =>
    buildInputsFromExercises(initialExercises)
  );
  const [pickerExerciseId, setPickerExerciseId] = useState(availableExercises[0]?.id ?? "");
  const [addExercisePending, setAddExercisePending] = useState(false);
  const [addExerciseError, setAddExerciseError] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editInputs, setEditInputs] = useState<Record<string, SetFormInput>>({});
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [flashSetId, setFlashSetId] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const logSetMutation = useMutation({
    mutationFn: (vars: {
      sessionExerciseId: string;
      weightKg: number;
      reps: number;
      isWarmup: boolean;
      tempId: string;
    }) => logSet(vars),
    onMutate: (vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? {
                ...ex,
                sets: [
                  ...ex.sets,
                  {
                    id: vars.tempId,
                    set_number: ex.sets.length + 1,
                    weight_kg: vars.weightKg,
                    reps: vars.reps,
                    is_warmup: vars.isWarmup,
                    pending: true,
                  },
                ],
              }
            : ex
        )
      );
    },
    onSuccess: (result, vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? {
                ...ex,
                sets: ex.sets.map((s) => (s.id === vars.tempId ? { ...result.set, pending: false } : s)),
                prWeightKg: result.isPr ? vars.weightKg : ex.prWeightKg,
              }
            : ex
        )
      );
      if (result.isPr) {
        const exercise = exercises.find((ex) => ex.sessionExerciseId === vars.sessionExerciseId);
        setPrBanner(`New PR on ${exercise?.exerciseName}: ${vars.weightKg}kg!`);
      }
      setFlashSetId(result.set.id);
      setTimeout(() => setFlashSetId((id) => (id === result.set.id ? null : id)), 900);
    },
    onError: (_err, vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? { ...ex, sets: ex.sets.filter((s) => s.id !== vars.tempId) }
            : ex
        )
      );
    },
  });

  const updateSetMutation = useMutation({
    mutationFn: (vars: {
      setId: string;
      sessionExerciseId: string;
      weightKg: number;
      reps: number;
      isWarmup: boolean;
    }) => updateSet(vars.setId, { weightKg: vars.weightKg, reps: vars.reps, isWarmup: vars.isWarmup }),
    onSuccess: (result, vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? {
                ...ex,
                sets: ex.sets.map((s) => (s.id === vars.setId ? { ...result.set } : s)),
                prWeightKg: result.isPr ? vars.weightKg : ex.prWeightKg,
              }
            : ex
        )
      );
      if (result.isPr) {
        const exercise = exercises.find((ex) => ex.sessionExerciseId === vars.sessionExerciseId);
        setPrBanner(`New PR on ${exercise?.exerciseName}: ${vars.weightKg}kg!`);
      }
      setEditingSetId(null);
    },
    onError: (err) => {
      setEditError(err instanceof Error ? err.message : "Failed to save that set");
      setEditingSetId(null);
    },
  });

  function stepInput(sessionExerciseId: string, field: "weight" | "reps", delta: number, step: number) {
    setInputs((prev) => {
      const current = prev[sessionExerciseId] ?? { weight: "", reps: "", warmup: false };
      return {
        ...prev,
        [sessionExerciseId]: { ...current, [field]: applyStep(current[field], delta, step) },
      };
    });
  }

  function stepEditInput(setId: string, field: "weight" | "reps", delta: number, step: number) {
    setEditInputs((prev) => {
      const current = prev[setId] ?? { weight: "", reps: "", warmup: false };
      return {
        ...prev,
        [setId]: { ...current, [field]: applyStep(current[field], delta, step) },
      };
    });
  }

  function handleAddSet(sessionExerciseId: string) {
    const input = inputs[sessionExerciseId];
    if (!input?.weight || !input?.reps) return;
    logSetMutation.mutate({
      sessionExerciseId,
      weightKg: Number(input.weight),
      reps: Number(input.reps),
      isWarmup: input.warmup ?? false,
      tempId: `temp-${Date.now()}-${Math.random()}`,
    });
    setInputs((prev) => ({
      ...prev,
      [sessionExerciseId]: { weight: input.weight, reps: input.reps, warmup: false },
    }));
  }

  function startEdit(set: SetEntry) {
    setConfirmDeleteSetId(null);
    setEditingSetId(set.id);
    setEditInputs((prev) => ({
      ...prev,
      [set.id]: { weight: String(set.weight_kg), reps: String(set.reps), warmup: set.is_warmup },
    }));
  }

  function confirmEdit(sessionExerciseId: string, setId: string) {
    const input = editInputs[setId];
    if (!input?.weight || !input?.reps) return;
    setEditError(null);
    updateSetMutation.mutate({
      setId,
      sessionExerciseId,
      weightKg: Number(input.weight),
      reps: Number(input.reps),
      isWarmup: input.warmup,
    });
  }

  async function handleDeleteSet(sessionExerciseId: string, set: SetEntry) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.sessionExerciseId === sessionExerciseId
          ? { ...ex, sets: ex.sets.filter((s) => s.id !== set.id) }
          : ex
      )
    );
    setConfirmDeleteSetId(null);
    setDeleteError(null);
    try {
      await deleteSet(set.id);
    } catch (err) {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === sessionExerciseId
            ? { ...ex, sets: [...ex.sets, set].sort((a, b) => a.set_number - b.set_number) }
            : ex
        )
      );
      setDeleteError(err instanceof Error ? err.message : "Failed to delete set");
    }
  }

  async function handleAddExercise() {
    if (!pickerExerciseId) return;
    setAddExercisePending(true);
    setAddExerciseError(null);
    try {
      const sessionExercise = await addExerciseToSession(sessionId, pickerExerciseId);
      const exerciseName =
        availableExercises.find((e) => e.id === pickerExerciseId)?.name ?? "Exercise";
      setExercises((prev) => [
        ...prev,
        {
          sessionExerciseId: sessionExercise.id,
          exerciseId: pickerExerciseId,
          exerciseName,
          sets: [],
          prWeightKg: sessionExercise.prWeightKg,
        },
      ]);
    } catch (err) {
      setAddExerciseError(err instanceof Error ? err.message : "Failed to add exercise");
    } finally {
      setAddExercisePending(false);
    }
  }

  async function handleFinish() {
    await finishSession(sessionId);
    router.push("/dashboard");
  }

  async function handleDiscard() {
    await discardSession(sessionId);
    router.push("/dashboard");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{sessionName}</h1>
      {prBanner && (
        <div className="flex items-center gap-2 rounded-xl bg-success/15 p-3 font-medium text-success">
          <Trophy className="h-5 w-5 shrink-0" />
          {prBanner}
        </div>
      )}
      {logSetMutation.isError && (
        <div className="rounded-xl bg-danger/15 p-3 text-danger">
          Failed to save that set — check your connection and try again.
        </div>
      )}
      {deleteError && <div className="rounded-xl bg-danger/15 p-3 text-danger">{deleteError}</div>}
      {editError && <div className="rounded-xl bg-danger/15 p-3 text-danger">{editError}</div>}
      {exercises.map((exercise) => {
        const input = inputs[exercise.sessionExerciseId] ?? { weight: "", reps: "", warmup: false };
        const hasPendingSet = exercise.sets.some((s) => s.pending);
        return (
          <Card key={exercise.sessionExerciseId}>
            <div className="flex items-center gap-2">
              <h2 className="font-medium">{exercise.exerciseName}</h2>
              {exercise.prWeightKg !== null && (
                <Badge tone="success" icon={<Trophy className="h-3 w-3" />}>
                  PR {exercise.prWeightKg}kg
                </Badge>
              )}
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {exercise.sets.map((set) => (
                <li key={set.id} className={set.pending ? "opacity-50" : ""}>
                  {editingSetId === set.id ? (
                    <div className="flex flex-col gap-3 rounded-xl bg-surface-muted p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <NumberField
                          label="Weight (kg)"
                          value={editInputs[set.id]?.weight ?? ""}
                          onChange={(value) =>
                            setEditInputs((prev) => ({
                              ...prev,
                              [set.id]: { ...prev[set.id], weight: value },
                            }))
                          }
                          onStep={(delta) => stepEditInput(set.id, "weight", delta, WEIGHT_STEP)}
                          step={WEIGHT_STEP}
                          inputMode="decimal"
                        />
                        <NumberField
                          label="Reps"
                          value={editInputs[set.id]?.reps ?? ""}
                          onChange={(value) =>
                            setEditInputs((prev) => ({
                              ...prev,
                              [set.id]: { ...prev[set.id], reps: value },
                            }))
                          }
                          onStep={(delta) => stepEditInput(set.id, "reps", delta, REPS_STEP)}
                          step={REPS_STEP}
                          inputMode="numeric"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <WarmupToggle
                          checked={editInputs[set.id]?.warmup ?? false}
                          onChange={(value) =>
                            setEditInputs((prev) => ({
                              ...prev,
                              [set.id]: { ...prev[set.id], warmup: value },
                            }))
                          }
                        />
                        <div className="flex items-center gap-1">
                          <IconButton
                            icon={<Check className="h-4 w-4" />}
                            aria-label="Save set"
                            loading={updateSetMutation.isPending}
                            onClick={() => confirmEdit(exercise.sessionExerciseId, set.id)}
                          />
                          <IconButton
                            icon={<X className="h-4 w-4" />}
                            aria-label="Cancel edit"
                            onClick={() => setEditingSetId(null)}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors duration-700 ${
                        flashSetId === set.id ? "bg-success/15" : "bg-transparent"
                      }`}
                    >
                      <span className="flex items-center gap-2 font-mono">
                        Set {set.set_number}: {set.weight_kg}kg × {set.reps}
                        {set.is_warmup && (
                          <Badge tone="neutral" className="font-sans">
                            Warmup
                          </Badge>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        {confirmDeleteSetId === set.id ? (
                          <>
                            <IconButton
                              icon={<Check className="h-4 w-4" />}
                              aria-label="Confirm delete set"
                              variant="danger"
                              onClick={() => handleDeleteSet(exercise.sessionExerciseId, set)}
                            />
                            <IconButton
                              icon={<X className="h-4 w-4" />}
                              aria-label="Cancel delete"
                              onClick={() => setConfirmDeleteSetId(null)}
                            />
                          </>
                        ) : (
                          <>
                            <IconButton
                              icon={<PencilSimple className="h-4 w-4" />}
                              aria-label="Edit set"
                              disabled={set.pending}
                              onClick={() => startEdit(set)}
                            />
                            <IconButton
                              icon={<Trash className="h-4 w-4" />}
                              aria-label="Delete set"
                              variant="danger"
                              disabled={set.pending}
                              onClick={() => setConfirmDeleteSetId(set.id)}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Weight (kg)"
                  value={input.weight}
                  onChange={(value) =>
                    setInputs((prev) => ({
                      ...prev,
                      [exercise.sessionExerciseId]: { ...prev[exercise.sessionExerciseId], weight: value },
                    }))
                  }
                  onStep={(delta) => stepInput(exercise.sessionExerciseId, "weight", delta, WEIGHT_STEP)}
                  step={WEIGHT_STEP}
                  inputMode="decimal"
                />
                <NumberField
                  label="Reps"
                  value={input.reps}
                  onChange={(value) =>
                    setInputs((prev) => ({
                      ...prev,
                      [exercise.sessionExerciseId]: { ...prev[exercise.sessionExerciseId], reps: value },
                    }))
                  }
                  onStep={(delta) => stepInput(exercise.sessionExerciseId, "reps", delta, REPS_STEP)}
                  step={REPS_STEP}
                  inputMode="numeric"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <WarmupToggle
                  checked={input.warmup}
                  onChange={(value) =>
                    setInputs((prev) => ({
                      ...prev,
                      [exercise.sessionExerciseId]: { ...prev[exercise.sessionExerciseId], warmup: value },
                    }))
                  }
                />
                <Button
                  variant="secondary"
                  icon={<Plus className="h-4 w-4" />}
                  loading={hasPendingSet}
                  onClick={() => handleAddSet(exercise.sessionExerciseId)}
                >
                  Add Set
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
      {availableExercises.length > 0 && (
        <Card>
          <h2 className="font-medium">Add Exercise</h2>
          <div className="mt-3 flex items-end gap-2">
            <Select
              label="Exercise"
              value={pickerExerciseId}
              onChange={(e) => setPickerExerciseId(e.target.value)}
              wrapperClassName="flex-1"
            >
              {availableExercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              loading={addExercisePending}
              onClick={handleAddExercise}
            >
              Add
            </Button>
          </div>
          {addExerciseError && <p className="mt-2 text-sm text-danger">{addExerciseError}</p>}
        </Card>
      )}
      <div className="space-y-3">
        <Button
          variant="success"
          size="lg"
          icon={<CheckCircle className="h-5 w-5" />}
          onClick={handleFinish}
          className="w-full"
        >
          Finish Workout
        </Button>
        {confirmDiscard ? (
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-muted">Discard this workout?</span>
            <Button variant="danger" onClick={handleDiscard}>
              Yes, discard
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              className="flex min-h-11 items-center gap-1.5 px-2 text-sm text-danger [touch-action:manipulation] hover:underline"
            >
              <Trash className="h-4 w-4" />
              Discard workout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
