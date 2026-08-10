"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  wrapperClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = "", wrapperClassName = "", ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        className={`min-h-11 rounded-lg border bg-surface-muted px-3 py-2 text-foreground placeholder:text-muted [touch-action:manipulation] focus:outline-none focus:ring-2 focus:ring-ring ${error ? "border-danger" : "border-border"} ${className}`}
        {...rest}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
});
