"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus } from "lucide-react";
import { createRoutineSchema } from "@/lib/validation";
import { createRoutine } from "@/lib/actions/routines";
import { Button } from "@/components/ui/Button";

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
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2"
      />
      <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} loading={isSubmitting}>
        Create
      </Button>
    </form>
  );
}
