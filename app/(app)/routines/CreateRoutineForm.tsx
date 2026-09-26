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
    setError,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({ resolver: zodResolver(createRoutineSchema) });

  async function onSubmit(values: FormValues) {
    try {
      await createRoutine(values);
      reset();
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : "Failed to create routine",
      });
    }
  }

  return (
    <div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
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
      {errors.root && <p className="mt-2 text-sm text-danger">{errors.root.message}</p>}
    </div>
  );
}
