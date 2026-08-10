"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus } from "@phosphor-icons/react/ssr";
import { createRoutineSchema } from "@/lib/validation";
import { createRoutine } from "@/lib/actions/routines";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type FormValues = z.infer<typeof createRoutineSchema>;

export function CreateRoutineForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({ resolver: zodResolver(createRoutineSchema) });

  async function onSubmit(values: FormValues) {
    await createRoutine(values);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Input
        label="Routine name"
        {...register("name")}
        placeholder="e.g. Push Day"
        error={errors.name?.message}
        wrapperClassName="sm:flex-1"
      />
      <Button
        type="submit"
        variant="primary"
        icon={<Plus className="h-4 w-4" />}
        loading={isSubmitting}
        className="sm:shrink-0"
      >
        Create
      </Button>
    </form>
  );
}
