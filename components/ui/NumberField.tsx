"use client";

import { useId } from "react";
import { Minus, Plus } from "@phosphor-icons/react/ssr";

function decimalPlaces(n: number) {
  const str = n.toString();
  const dotIndex = str.indexOf(".");
  return dotIndex === -1 ? 0 : str.length - dotIndex - 1;
}

/** Applies a step delta to a string-valued numeric field, rounded to the step's precision and clamped to min. */
export function applyStep(current: string, delta: number, step: number, min = 0): string {
  const factor = 10 ** decimalPlaces(step);
  const currentNum = Number(current) || 0;
  const next = Math.max(min, Math.round((currentNum + delta) * factor) / factor);
  return String(next);
}

export function NumberField({
  label,
  value,
  onChange,
  onStep,
  step = 1,
  min = 0,
  inputMode = "decimal",
  id,
  name,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onStep: (delta: number) => void;
  step?: number;
  min?: number;
  inputMode?: "decimal" | "numeric";
  id?: string;
  name?: string;
  className?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onStep(-step)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-foreground transition [touch-action:manipulation] hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          id={fieldId}
          name={name}
          type="number"
          inputMode={inputMode}
          step={step}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 flex-1 rounded-lg border border-border bg-surface-muted px-2 py-2 text-center font-mono text-lg text-foreground [touch-action:manipulation] focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onStep(step)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-foreground transition [touch-action:manipulation] hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
