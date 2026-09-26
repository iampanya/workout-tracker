"use client";

import { useState } from "react";
import { Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { WarmupToggle, WeightRepsFields, isValidSetInput } from "./SetForm";
import type { SetEntry, SetFormInput, SetValues } from "./types";

// Inline editor for a logged set: opened by tapping the set's row. Delete lives here (with a
// second-tap confirm) rather than as an icon on every row, so rows stay easy to scan and hard
// to mis-tap mid-workout.
export function SetEditor({
  set,
  saving,
  onSave,
  onDelete,
  onCancel,
}: {
  set: SetEntry;
  saving: boolean;
  onSave: (values: SetValues) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState<SetFormInput>({
    weight: String(set.weight_kg),
    reps: String(set.reps),
    warmup: set.is_warmup,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="-mx-2 flex flex-col gap-3 rounded-xl bg-surface-muted p-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Edit set {set.set_number}
      </p>
      <WeightRepsFields value={input} onChange={setInput} />
      <div>
        <WarmupToggle
          checked={input.warmup}
          onChange={(warmup) => setInput((prev) => ({ ...prev, warmup }))}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="danger"
          icon={<Trash className="h-4 w-4" />}
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          className={confirmDelete ? "bg-danger/10" : ""}
        >
          {confirmDelete ? "Tap to delete" : "Delete"}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!isValidSetInput(input)}
            onClick={() =>
              onSave({
                weightKg: Number(input.weight),
                reps: Number(input.reps),
                isWarmup: input.warmup,
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
