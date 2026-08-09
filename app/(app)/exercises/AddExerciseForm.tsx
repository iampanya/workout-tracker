"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { createExerciseSchema } from "@/lib/validation";
import { createCustomExercise } from "@/lib/actions/exercises";

type FormValues = z.infer<typeof createExerciseSchema>;

export function AddExerciseForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({ resolver: zodResolver(createExerciseSchema) });

  async function onSubmit(values: FormValues) {
    await createCustomExercise(values);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
      <input
        {...register("name")}
        placeholder="Exercise name"
        className="flex-1 rounded border px-3 py-2"
      />
      <input
        {...register("muscleGroup")}
        placeholder="Muscle group (optional)"
        className="w-40 rounded border px-3 py-2"
      />
      <button type="submit" disabled={isSubmitting} className="rounded bg-black px-3 py-2 text-white">
        Add
      </button>
      {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
    </form>
  );
}
