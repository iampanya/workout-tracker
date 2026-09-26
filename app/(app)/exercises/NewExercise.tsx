"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { AddExerciseForm } from "./AddExerciseForm";

// Page header with a "New exercise" button; the custom-exercise form stays folded away until
// asked for, so the list is what you see first.
export function NewExerciseHeader({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {!open && (
          <Button
            variant="secondary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setOpen(true)}
          >
            New exercise
          </Button>
        )}
      </div>
      {open && <AddExerciseForm onDone={() => setOpen(false)} />}
    </div>
  );
}
