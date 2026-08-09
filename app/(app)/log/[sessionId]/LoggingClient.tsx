"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { logSet, finishSession, discardSession, addExerciseToSession } from "@/lib/actions/sessions";

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
      {prBanner && <div className="rounded bg-yellow-100 p-3 text-yellow-800">{prBanner}</div>}
      {logSetMutation.isError && (
        <div className="rounded bg-red-100 p-3 text-red-800">
          Failed to save that set — check your connection and try again.
        </div>
      )}
      {exercises.map((exercise) => {
        const input = inputs[exercise.sessionExerciseId] ?? { weight: "", reps: "", warmup: false };
        return (
          <div key={exercise.sessionExerciseId} className="rounded border p-4">
            <h2 className="font-medium">{exercise.exerciseName}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {exercise.sets.map((set) => (
                <li key={set.id} className={set.pending ? "opacity-50" : ""}>
                  Set {set.set_number}: {set.weight_kg}kg × {set.reps}
                  {set.is_warmup ? " (warmup)" : ""}
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
                className="w-20 rounded border px-2 py-1"
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
                className="w-20 rounded border px-2 py-1"
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
              <button
                onClick={() => handleAddSet(exercise.sessionExerciseId)}
                className="rounded bg-black px-3 py-1 text-white"
              >
                Add Set
              </button>
            </div>
          </div>
        );
      })}
      {availableExercises.length > 0 && (
        <div className="rounded border p-4">
          <h2 className="font-medium">Add Exercise</h2>
          <div className="mt-2 flex gap-2">
            <select
              value={pickerExerciseId}
              onChange={(e) => setPickerExerciseId(e.target.value)}
              className="flex-1 rounded border px-3 py-2"
            >
              {availableExercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddExercise}
              disabled={addExercisePending}
              className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
            >
              {addExercisePending ? "Adding..." : "Add"}
            </button>
          </div>
          {addExerciseError && <p className="mt-2 text-sm text-red-600">{addExerciseError}</p>}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={handleFinish} className="rounded bg-green-600 px-4 py-2 text-white">
          Finish Workout
        </button>
        <button onClick={handleDiscard} className="rounded bg-gray-300 px-4 py-2">
          Discard
        </button>
      </div>
    </div>
  );
}
