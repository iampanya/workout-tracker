"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus } from "lucide-react";
import { createExerciseSchema } from "@/lib/validation";
import { createCustomExercise } from "@/lib/actions/exercises";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type FormValues = z.infer<typeof createExerciseSchema>;

const MUSCLE_GROUPS = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"] as const;

export function AddExerciseForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createExerciseSchema),
    defaultValues: { muscleGroup: "Chest" },
  });

  async function onSubmit(values: FormValues) {
    await createCustomExercise(values);
    reset({ name: "", muscleGroup: "Chest" });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
        <input
          {...register("name")}
          placeholder="Exercise name"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2"
        />
        <select
          {...register("muscleGroup")}
          className="w-40 rounded-lg border border-border bg-surface px-3 py-2"
        >
          {MUSCLE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} loading={isSubmitting}>
          Add
        </Button>
      </form>
      {errors.name && <p className="mt-2 text-sm text-danger">{errors.name.message}</p>}
      {errors.muscleGroup && <p className="mt-2 text-sm text-danger">{errors.muscleGroup.message}</p>}
    </Card>
  );
}
