"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { NumberField, applyStep } from "@/components/ui/NumberField";
import { WEIGHT_STEP_PRESETS, type WeightStep } from "@/lib/insights/progression";
import { updateWeightStepSchema } from "@/lib/validation";
import { setExerciseWeightStep } from "@/lib/actions/exercises";

type Choice = "auto" | "other" | number;

// Edits an exercise's weight step (exercise_settings). Shared by the log screen's target chip and
// the exercise page. The form only mounts while open (Sheet renders nothing when closed), so every
// open starts from the current step.
export function WeightStepSheet({
  open,
  onClose,
  exerciseId,
  weightStep,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  weightStep: WeightStep;
  onSaved: (step: WeightStep) => void;
}) {
  const titleId = useId();
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <WeightStepForm
        titleId={titleId}
        exerciseId={exerciseId}
        weightStep={weightStep}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Sheet>
  );
}

const OTHER_STEP = 0.5;

function chipClass(active: boolean) {
  return `flex min-h-11 rounded-lg border px-2 text-sm font-medium tabular-nums transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
    active
      ? "border-accent bg-accent text-accent-foreground"
      : "border-border bg-surface-muted text-foreground hover:bg-border/40"
  }`;
}

function WeightStepForm({
  titleId,
  exerciseId,
  weightStep,
  onClose,
  onSaved,
}: {
  titleId: string;
  exerciseId: string;
  weightStep: WeightStep;
  onClose: () => void;
  onSaved: (step: WeightStep) => void;
}) {
  const t = useTranslations("weightStep");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const custom = weightStep.source === "custom" ? weightStep.kg : null;
  const [choice, setChoice] = useState<Choice>(
    custom === null ? "auto" : WEIGHT_STEP_PRESETS.includes(custom) ? custom : "other"
  );
  const [other, setOther] = useState(
    custom !== null && !WEIGHT_STEP_PRESETS.includes(custom) ? String(custom) : ""
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherKg = Number(other);
  const otherValid =
    other.trim() !== "" && updateWeightStepSchema.safeParse({ weightStepKg: otherKg }).success;
  // undefined = nothing valid to save yet.
  const value: number | null | undefined =
    choice === "auto" ? null : choice === "other" ? (otherValid ? otherKg : undefined) : choice;

  function pick(next: Choice) {
    setChoice(next);
    setError(null);
  }

  async function save() {
    if (value === undefined) return;
    setPending(true);
    setError(null);
    try {
      onSaved(await setExerciseWeightStep(exerciseId, value));
      onClose();
    } catch (err) {
      console.error(err);
      setError(te("weightStep"));
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden="true">
        <span className="h-1 w-10 rounded-full bg-border" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-2 sm:pt-4">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("description")}</p>
        </div>

        <button
          type="button"
          aria-pressed={choice === "auto"}
          disabled={pending}
          onClick={() => pick("auto")}
          className={`${chipClass(choice === "auto")} flex-col items-start px-3 py-2 text-left`}
        >
          <span>{t("auto")}</span>
          <span className={`text-xs font-normal ${choice === "auto" ? "" : "text-muted"}`}>
            {weightStep.autoSource === "history"
              ? t("autoFromHistory", { kg: weightStep.autoKg })
              : t("autoDefault", { kg: weightStep.autoKg })}
          </span>
        </button>

        <div className="grid grid-cols-4 gap-2">
          {WEIGHT_STEP_PRESETS.map((kg) => (
            <button
              key={kg}
              type="button"
              aria-pressed={choice === kg}
              disabled={pending}
              onClick={() => pick(kg)}
              className={`${chipClass(choice === kg)} items-center justify-center`}
            >
              {kg}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={choice === "other"}
            disabled={pending}
            onClick={() => pick("other")}
            className={`${chipClass(choice === "other")} items-center justify-center`}
          >
            {t("other")}
          </button>
        </div>

        {choice === "other" && (
          <NumberField
            label={t("customLabel")}
            value={other}
            onChange={(v) => {
              setOther(v);
              setError(null);
            }}
            onStep={(delta) => {
              setOther((prev) => applyStep(prev, delta, OTHER_STEP));
              setError(null);
            }}
            step={OTHER_STEP}
          />
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border p-4">
        <Button variant="secondary" className="flex-1" disabled={pending} onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          loading={pending}
          disabled={value === undefined}
          onClick={save}
        >
          {tc("save")}
        </Button>
      </div>
    </>
  );
}
