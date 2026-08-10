"use client";

import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { CaretDown } from "@phosphor-icons/react/ssr";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  wrapperClassName?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, id, className = "", wrapperClassName = "", children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
      <label htmlFor={selectId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error}
          className={`min-h-11 w-full appearance-none rounded-lg border bg-surface-muted px-3 py-2 pr-9 text-foreground [touch-action:manipulation] focus:outline-none focus:ring-2 focus:ring-ring ${error ? "border-danger" : "border-border"} ${className}`}
          {...rest}
        >
          {children}
        </select>
        <CaretDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
});
