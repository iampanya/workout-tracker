import { type HTMLAttributes } from "react";

export function Card({
  className = "",
  padding = true,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { padding?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface ${padding ? "p-4" : ""} ${className}`}
      {...rest}
    />
  );
}
