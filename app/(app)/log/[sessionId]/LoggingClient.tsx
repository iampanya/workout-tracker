"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle, CircleNotch, Trash, Trophy } from "@phosphor-icons/react/ssr";
import {
  logSet,
  updateSet,
  deleteSet,
  finishSession,
  discardSession,
  addExerciseToSession,
  removeExerciseFromSession,
} from "@/lib/actions/sessions";
import { computeSessionSummary, formatDuration } from "@/lib/sessions/summary";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ExerciseCombobox } from "@/components/ui/ExerciseCombobox";
import { Toast } from "@/components/ui/Toast";
import { ExerciseCard } from "./ExerciseCard";
import { RestTimer } from "./RestTimer";
import { SessionNotes } from "./SessionNotes";
import type { ExerciseEntry, SetEntry, SetValues } from "./types";

type AvailableExercise = { id: string; name: string; muscleGroup: string | null };

// The exercise to open first: the first one still short of its target (or with no sets),
// else the last one.
function initialExpandedId(list: ExerciseEntry[]): string | null {
  const next = list.find((ex) => {
    const working = ex.sets.filter((s) => !s.is_warmup).length;
    return ex.sets.length === 0 || (ex.targetSets !== null && working < ex.targetSets);
  });
  return (next ?? list[list.length - 1])?.sessionExerciseId ?? null;
}

// Minutes since the session started, ticking every 30s. Null until mounted so the server
// render and hydration agree (the clock differs between them).
function useElapsedMinutes(startedAt: string): number | null {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const start = Date.parse(startedAt);
    const update = () => setMinutes(Math.max(0, Math.floor((Date.now() - start) / 60000)));
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [startedAt]);
  return minutes;
}

export function LoggingClient({
  sessionId,
  sessionName,
  startedAt,
  initialNotes,
  initialExercises,
  availableExercises,
}: {
  sessionId: string;
  sessionName: string;
  startedAt: string;
  initialNotes: string | null;
  initialExercises: ExerciseEntry[];
  availableExercises: AvailableExercise[];
}) {
  const router = useRouter();
  const [exercises, setExercises] = useState(initialExercises);
  const [expandedId, setExpandedId] = useState(() => initialExpandedId(initialExercises));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [flashSetId, setFlashSetId] = useState<string | null>(null);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  // Starts empty so nothing gets added by accident; picking an exercise adds it immediately.
  const [pickerExerciseId, setPickerExerciseId] = useState("");
  const [addExercisePending, setAddExercisePending] = useState(false);
  const [addExerciseError, setAddExerciseError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discardPending, setDiscardPending] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [confirmRemoveExerciseId, setConfirmRemoveExerciseId] = useState<string | null>(null);
  const [removeExercisePending, setRemoveExercisePending] = useState(false);
  const [finishBlocked, setFinishBlocked] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishPending, setFinishPending] = useState(false);

  const elapsedMinutes = useElapsedMinutes(startedAt);
  const summary = computeSessionSummary(exercises);
  const dismissToast = useCallback(() => setToast(null), []);

  function setError(sessionExerciseId: string, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[sessionExerciseId] = message;
      else delete next[sessionExerciseId];
      return next;
    });
  }

  function announcePr(sessionExerciseId: string, weightKg: number) {
    const exercise = exercises.find((ex) => ex.sessionExerciseId === sessionExerciseId);
    setToast(`New PR on ${exercise?.exerciseName ?? "this exercise"}: ${weightKg} kg!`);
  }

  const logSetMutation = useMutation({
    mutationFn: (vars: SetValues & { sessionExerciseId: string }) => logSet(vars),
    // The optimistic row's temporary id travels to onSuccess/onError via the mutation context.
    onMutate: (vars) => {
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      setError(vars.sessionExerciseId, null);
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? {
                ...ex,
                sets: [
                  ...ex.sets,
                  {
                    id: tempId,
                    set_number: (ex.sets[ex.sets.length - 1]?.set_number ?? 0) + 1,
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
      return { tempId };
    },
    onSuccess: (result, vars, context) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? {
                ...ex,
                sets: ex.sets.map((s) =>
                  s.id === context.tempId ? { ...result.set, pending: false } : s
                ),
                prWeightKg: result.isPr ? vars.weightKg : ex.prWeightKg,
              }
            : ex
        )
      );
      if (result.isPr) announcePr(vars.sessionExerciseId, vars.weightKg);
      setRestStartedAt(Date.now());
      setFlashSetId(result.set.id);
      setTimeout(() => setFlashSetId((id) => (id === result.set.id ? null : id)), 900);
    },
    onError: (_err, vars, context) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? { ...ex, sets: ex.sets.filter((s) => s.id !== context?.tempId) }
            : ex
        )
      );
      setError(
        vars.sessionExerciseId,
        "Failed to save that set — check your connection and try again."
      );
    },
  });

  const updateSetMutation = useMutation({
    mutationFn: (vars: SetValues & { setId: string; sessionExerciseId: string }) =>
      updateSet(vars.setId, { weightKg: vars.weightKg, reps: vars.reps, isWarmup: vars.isWarmup }),
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
      if (result.isPr) announcePr(vars.sessionExerciseId, vars.weightKg);
    },
  });

  function handleAddSet(sessionExerciseId: string, values: SetValues) {
    logSetMutation.mutate({ sessionExerciseId, ...values });
  }

  async function handleUpdateSet(sessionExerciseId: string, set: SetEntry, values: SetValues) {
    setError(sessionExerciseId, null);
    try {
      await updateSetMutation.mutateAsync({ setId: set.id, sessionExerciseId, ...values });
      return true;
    } catch (err) {
      setError(sessionExerciseId, err instanceof Error ? err.message : "Failed to save that set");
      return false;
    }
  }

  async function handleDeleteSet(sessionExerciseId: string, set: SetEntry) {
    setError(sessionExerciseId, null);
    setExercises((prev) =>
      prev.map((ex) =>
        ex.sessionExerciseId === sessionExerciseId
          ? { ...ex, sets: ex.sets.filter((s) => s.id !== set.id) }
          : ex
      )
    );
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
      setError(sessionExerciseId, err instanceof Error ? err.message : "Failed to delete set");
    }
  }

  async function handleAddExercise(exerciseId: string) {
    if (!exerciseId || addExercisePending) return;
    setPickerExerciseId(exerciseId);
    setAddExercisePending(true);
    setAddExerciseError(null);
    try {
      const added = await addExerciseToSession(sessionId, exerciseId);
      const exerciseName = availableExercises.find((e) => e.id === exerciseId)?.name ?? "Exercise";
      setExercises((prev) => [
        ...prev,
        {
          sessionExerciseId: added.id,
          exerciseId,
          exerciseName,
          sets: [],
          prWeightKg: added.prWeightKg,
          lastSession: added.lastSession,
          targetSets: null,
        },
      ]);
      setExpandedId(added.id);
    } catch (err) {
      setAddExerciseError(err instanceof Error ? err.message : "Failed to add exercise");
    } finally {
      setAddExercisePending(false);
      setPickerExerciseId("");
    }
  }

  function requestRemoveExercise(exercise: ExerciseEntry) {
    setError(exercise.sessionExerciseId, null);
    if (exercise.sets.length > 0) {
      setConfirmRemoveExerciseId(exercise.sessionExerciseId);
    } else {
      handleRemoveExercise(exercise.sessionExerciseId);
    }
  }

  async function handleRemoveExercise(sessionExerciseId: string) {
    const index = exercises.findIndex((e) => e.sessionExerciseId === sessionExerciseId);
    const removed = exercises[index];
    if (!removed) return;
    setRemoveExercisePending(true);
    setExercises((prev) => prev.filter((e) => e.sessionExerciseId !== sessionExerciseId));
    try {
      await removeExerciseFromSession(sessionExerciseId);
      setConfirmRemoveExerciseId(null);
    } catch (err) {
      // Roll back to the original position so ordering is preserved.
      setExercises((prev) => {
        const next = [...prev];
        next.splice(index, 0, removed);
        return next;
      });
      setConfirmRemoveExerciseId(null);
      setError(sessionExerciseId, err instanceof Error ? err.message : "Failed to remove exercise");
    } finally {
      setRemoveExercisePending(false);
    }
  }

  async function handleFinish() {
    if (exercises.length === 0) {
      setFinishBlocked(true);
      setFinishError("Add an exercise and log at least one set before finishing.");
      return;
    }
    const emptyExercises = exercises.filter((e) => e.sets.length === 0);
    if (emptyExercises.length > 0) {
      setFinishBlocked(true);
      setFinishError(
        `Remove or add a set to ${emptyExercises.map((e) => e.exerciseName).join(", ")} before finishing.`
      );
      return;
    }
    setFinishBlocked(false);
    setFinishError(null);
    setFinishPending(true);
    try {
      await finishSession(sessionId);
      router.push(`/history/${sessionId}?finished=1`);
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : "Failed to finish workout");
      setFinishPending(false);
    }
  }

  async function handleDiscard() {
    setDiscardPending(true);
    setDiscardError(null);
    try {
      await discardSession(sessionId);
      router.push("/dashboard");
    } catch (err) {
      setDiscardError(err instanceof Error ? err.message : "Failed to discard workout");
      setDiscardPending(false);
    }
  }

  const removeTarget =
    exercises.find((e) => e.sessionExerciseId === confirmRemoveExerciseId) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{sessionName}</h1>
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            {summary.exerciseCount} {summary.exerciseCount === 1 ? "exercise" : "exercises"} ·{" "}
            {summary.setCount} {summary.setCount === 1 ? "set" : "sets"}
            {summary.totalVolumeKg > 0 && ` · ${summary.totalVolumeKg.toLocaleString()} kg`}
            {elapsedMinutes !== null &&
              ` · ${elapsedMinutes > 0 ? formatDuration(elapsedMinutes) : "just started"}`}
          </p>
        </div>
        <IconButton
          icon={<Trash className="h-5 w-5" />}
          aria-label="Discard workout"
          variant="danger"
          className="-mr-2 shrink-0"
          onClick={() => {
            setDiscardError(null);
            setConfirmDiscard(true);
          }}
        />
      </header>

      <div className="space-y-3">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.sessionExerciseId}
            exercise={exercise}
            expanded={expandedId === exercise.sessionExerciseId}
            blocked={finishBlocked && exercise.sets.length === 0}
            error={errors[exercise.sessionExerciseId] ?? null}
            flashSetId={flashSetId}
            savingSetId={
              updateSetMutation.isPending ? (updateSetMutation.variables?.setId ?? null) : null
            }
            onExpand={() => setExpandedId(exercise.sessionExerciseId)}
            onAddSet={(values) => handleAddSet(exercise.sessionExerciseId, values)}
            onUpdateSet={(set, values) => handleUpdateSet(exercise.sessionExerciseId, set, values)}
            onDeleteSet={(set) => handleDeleteSet(exercise.sessionExerciseId, set)}
            onRemove={() => requestRemoveExercise(exercise)}
          />
        ))}
      </div>

      {exercises.length === 0 && (
        <p className="text-center text-sm text-muted">
          No exercises yet — add one below to start logging sets.
        </p>
      )}

      {availableExercises.length > 0 && (
        <Card>
          <div className="flex items-end gap-2">
            <ExerciseCombobox
              label="Add exercise"
              exercises={availableExercises}
              value={pickerExerciseId}
              onChange={handleAddExercise}
              wrapperClassName="flex-1"
            />
            {addExercisePending && (
              <span
                role="status"
                aria-label="Adding exercise"
                className="flex h-11 w-11 items-center justify-center text-muted"
              >
                <CircleNotch className="h-5 w-5 animate-spin" />
              </span>
            )}
          </div>
          {addExerciseError && <p className="mt-2 text-sm text-danger">{addExerciseError}</p>}
        </Card>
      )}

      <SessionNotes sessionId={sessionId} initialNotes={initialNotes} />

      {/* Sticky action bar: rest timer + Finish, kept in reach however long the workout gets.
          Sits just above the mobile BottomNav (whose log FAB is hidden on this screen). */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface/95 p-2 shadow-lg backdrop-blur">
          <RestTimer startedAt={restStartedAt} onClear={() => setRestStartedAt(null)} />
          <Button
            variant="success"
            size="lg"
            icon={<CheckCircle className="h-5 w-5" />}
            loading={finishPending}
            onClick={handleFinish}
            className="min-w-0 flex-1"
          >
            Finish
          </Button>
        </div>
      </div>

      <Toast
        message={toast}
        tone="success"
        icon={<Trophy className="h-5 w-5" weight="fill" />}
        onDismiss={dismissToast}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this workout?"
        description={
          discardError ? (
            <span className="text-danger">{discardError}</span>
          ) : (
            "This workout and any sets logged in it will be permanently deleted."
          )
        }
        confirmLabel="Discard"
        tone="danger"
        loading={discardPending}
        onConfirm={handleDiscard}
        onCancel={() => setConfirmDiscard(false)}
      />
      <ConfirmDialog
        open={finishError !== null}
        title="Can't finish yet"
        description={finishError}
        confirmLabel="Got it"
        hideCancel
        onConfirm={() => setFinishError(null)}
        onCancel={() => setFinishError(null)}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove this exercise?"
        description={
          removeTarget && (
            <>
              &ldquo;{removeTarget.exerciseName}&rdquo; and its {removeTarget.sets.length} logged{" "}
              {removeTarget.sets.length === 1 ? "set" : "sets"} will be removed from this workout.
            </>
          )
        }
        confirmLabel="Remove"
        tone="danger"
        loading={removeExercisePending}
        onConfirm={() => removeTarget && handleRemoveExercise(removeTarget.sessionExerciseId)}
        onCancel={() => setConfirmRemoveExerciseId(null)}
      />
    </div>
  );
}
