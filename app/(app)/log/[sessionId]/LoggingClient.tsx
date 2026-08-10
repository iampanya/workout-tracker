"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Check, X, CheckCircle2 } from "lucide-react";
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
};
type SetFormInput = { weight: string; reps: string; warmup: boolean };
type AvailableExercise = { id: string; name: string };

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
  const [inputs, setInputs] = useState<Record<string, SetFormInput>>({});
  const [pickerExerciseId, setPickerExerciseId] = useState(availableExercises[0]?.id ?? "");
  const [addExercisePending, setAddExercisePending] = useState(false);
  const [addExerciseError, setAddExerciseError] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editInputs, setEditInputs] = useState<Record<string, SetFormInput>>({});
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
              }
            : ex
        )
      );
      if (result.isPr) {
        const exercise = exercises.find((ex) => ex.sessionExerciseId === vars.sessionExerciseId);
        setPrBanner(`New PR on ${exercise?.exerciseName}: ${vars.weightKg}kg!`);
      }
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
            ? { ...ex, sets: ex.sets.map((s) => (s.id === vars.setId ? { ...result.set } : s)) }
            : ex
        )
      );
      if (result.isPr) {
        const exercise = exercises.find((ex) => ex.sessionExerciseId === vars.sessionExerciseId);
        setPrBanner(`New PR on ${exercise?.exerciseName}: ${vars.weightKg}kg!`);
      }
      setEditingSetId(null);
    },
  });

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
    setInputs((prev) => ({ ...prev, [sessionExerciseId]: { weight: "", reps: "", warmup: false } }));
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
        <div className="rounded-xl bg-warning/15 p-3 font-medium text-warning">{prBanner}</div>
      )}
      {logSetMutation.isError && (
        <div className="rounded-xl bg-danger/15 p-3 text-danger">
          Failed to save that set — check your connection and try again.
        </div>
      )}
      {deleteError && <div className="rounded-xl bg-danger/15 p-3 text-danger">{deleteError}</div>}
      {exercises.map((exercise) => {
        const input = inputs[exercise.sessionExerciseId] ?? { weight: "", reps: "", warmup: false };
        return (
          <Card key={exercise.sessionExerciseId}>
            <h2 className="font-medium">{exercise.exerciseName}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {exercise.sets.map((set) => (
                <li key={set.id} className={set.pending ? "opacity-50" : ""}>
                  {editingSetId === set.id ? (
                    <div className="flex items-center gap-2 py-1">
                      <input
                        type="number"
                        value={editInputs[set.id]?.weight ?? ""}
                        onChange={(e) =>
                          setEditInputs((prev) => ({
                            ...prev,
                            [set.id]: { ...prev[set.id], weight: e.target.value },
                          }))
                        }
                        className="w-16 rounded-lg border border-border bg-surface px-2 py-1"
                      />
                      <input
                        type="number"
                        value={editInputs[set.id]?.reps ?? ""}
                        onChange={(e) =>
                          setEditInputs((prev) => ({
                            ...prev,
                            [set.id]: { ...prev[set.id], reps: e.target.value },
                          }))
                        }
                        className="w-16 rounded-lg border border-border bg-surface px-2 py-1"
                      />
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={editInputs[set.id]?.warmup ?? false}
                          onChange={(e) =>
                            setEditInputs((prev) => ({
                              ...prev,
                              [set.id]: { ...prev[set.id], warmup: e.target.checked },
                            }))
                          }
                        />
                        Warmup
                      </label>
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
                  ) : (
                    <div className="flex items-center justify-between py-1">
                      <span>
                        Set {set.set_number}: {set.weight_kg}kg × {set.reps}
                        {set.is_warmup ? " (warmup)" : ""}
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
                              icon={<Pencil className="h-4 w-4" />}
                              aria-label="Edit set"
                              onClick={() => startEdit(set)}
                            />
                            <IconButton
                              icon={<Trash2 className="h-4 w-4" />}
                              aria-label="Delete set"
                              variant="danger"
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
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                placeholder="kg"
                value={input.weight}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    [exercise.sessionExerciseId]: { ...input, weight: e.target.value },
                  }))
                }
                className="w-20 rounded-lg border border-border bg-surface px-2 py-1"
              />
              <input
                type="number"
                placeholder="reps"
                value={input.reps}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    [exercise.sessionExerciseId]: { ...input, reps: e.target.value },
                  }))
                }
                className="w-20 rounded-lg border border-border bg-surface px-2 py-1"
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={input.warmup}
                  onChange={(e) =>
                    setInputs((prev) => ({
                      ...prev,
                      [exercise.sessionExerciseId]: { ...input, warmup: e.target.checked },
                    }))
                  }
                />
                Warmup
              </label>
              <Button
                variant="secondary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => handleAddSet(exercise.sessionExerciseId)}
              >
                Add Set
              </Button>
            </div>
          </Card>
        );
      })}
      {availableExercises.length > 0 && (
        <Card>
          <h2 className="font-medium">Add Exercise</h2>
          <div className="mt-2 flex gap-2">
            <select
              value={pickerExerciseId}
              onChange={(e) => setPickerExerciseId(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2"
            >
              {availableExercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
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
      <div className="flex gap-2">
        <Button variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} onClick={handleFinish}>
          Finish Workout
        </Button>
        <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={handleDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
