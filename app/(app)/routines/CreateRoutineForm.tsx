"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { createRoutineSchema } from "@/lib/validation";
import { createRoutine } from "@/lib/actions/routines";

type FormValues = z.infer<typeof createRoutineSchema>;

export function CreateRoutineForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(createRoutineSchema) });

  async function onSubmit(values: FormValues) {
    await createRoutine(values);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
      <input
        {...register("name")}
        placeholder="Routine name (e.g. Push Day)"
        className="flex-1 rounded border px-3 py-2"
      />
      <button type="submit" disabled={isSubmitting} className="rounded bg-black px-3 py-2 text-white">
        Create
      </button>
    </form>
  );
}
