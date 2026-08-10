"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus } from "@phosphor-icons/react/ssr";
import { createExerciseSchema } from "@/lib/validation";
import { createCustomExercise } from "@/lib/actions/exercises";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          label="Exercise name"
          {...register("name")}
          placeholder="e.g. Bicep Curl"
          error={errors.name?.message}
          wrapperClassName="sm:flex-1"
        />
        <Select label="Muscle group" {...register("muscleGroup")} wrapperClassName="sm:w-40">
          {MUSCLE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </Select>
        <Button
          type="submit"
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          loading={isSubmitting}
          className="sm:shrink-0"
        >
          Add
        </Button>
      </form>
      {errors.muscleGroup && <p className="mt-2 text-sm text-danger">{errors.muscleGroup.message}</p>}
    </Card>
  );
}
