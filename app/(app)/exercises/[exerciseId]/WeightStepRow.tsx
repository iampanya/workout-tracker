"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PencilSimple } from "@phosphor-icons/react/ssr";
import { IconButton } from "@/components/ui/IconButton";
import { WeightStepSheet } from "@/components/exercises/WeightStepSheet";
import type { WeightStep } from "@/lib/insights/progression";

export function WeightStepRow({ exerciseId, initial }: { exerciseId: string; initial: WeightStep }) {
  const t = useTranslations("weightStep");
  const [step, setStep] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-1 text-sm text-muted">
      <span>{step.source === "custom" ? t("row", { kg: step.kg }) : t("rowAuto", { kg: step.kg })}</span>
      <IconButton
        icon={<PencilSimple className="h-4 w-4" />}
        aria-label={t("edit")}
        onClick={() => setOpen(true)}
      />
      <WeightStepSheet
        open={open}
        onClose={() => setOpen(false)}
        exerciseId={exerciseId}
        weightStep={step}
        onSaved={setStep}
      />
    </div>
  );
}
