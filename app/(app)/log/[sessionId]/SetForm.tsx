"use client";

import { Check } from "@phosphor-icons/react/ssr";
import { NumberField, applyStep } from "@/components/ui/NumberField";
import { REPS_STEP, WEIGHT_STEP, type SetFormInput } from "./types";

export function WarmupToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked ? "bg-accent-secondary/15 text-accent-secondary" : "bg-surface-muted text-muted"
      }`}
    >
      {checked && <Check className="h-4 w-4" />}
      Warmup
    </button>
  );
}

// Weight + reps steppers shared by the "add set" form and the set editor. The +/- handlers go
// through the parent's functional updater (see applyStep) so rapid taps never drop a step.
export function WeightRepsFields({
  value,
  onChange,
}: {
  value: SetFormInput;
  onChange: (update: (prev: SetFormInput) => SetFormInput) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        label="Weight (kg)"
        value={value.weight}
        onChange={(weight) => onChange((prev) => ({ ...prev, weight }))}
        onStep={(delta) =>
          onChange((prev) => ({ ...prev, weight: applyStep(prev.weight, delta, WEIGHT_STEP) }))
        }
        step={WEIGHT_STEP}
        inputMode="decimal"
      />
      <NumberField
        label="Reps"
        value={value.reps}
        onChange={(reps) => onChange((prev) => ({ ...prev, reps }))}
        onStep={(delta) =>
          onChange((prev) => ({ ...prev, reps: applyStep(prev.reps, delta, REPS_STEP) }))
        }
        step={REPS_STEP}
        inputMode="numeric"
      />
    </div>
  );
}

// True when both fields hold a positive number (what logSetSchema accepts).
export function isValidSetInput(input: SetFormInput): boolean {
  return Number(input.weight) > 0 && Number(input.reps) > 0;
}
