"use client";

import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { MagnifyingGlass, Check } from "@phosphor-icons/react/ssr";

export type ExerciseOption = { id: string; name: string; muscleGroup: string | null };

// A searchable single-select for exercises. Filters by exercise name OR muscle group
// (case-insensitive substring). Assumes `exercises` is pre-sorted by muscle_group then
// name (as listExercises returns) so results group cleanly under muscle-group headers.
export function ExerciseCombobox({
  label,
  exercises,
  value,
  onChange,
  wrapperClassName = "",
}: {
  label: string;
  exercises: ExerciseOption[];
  value: string;
  onChange: (id: string) => void;
  wrapperClassName?: string;
}) {
  const inputId = useId();
  const listId = useId();
  const selected = exercises.find((e) => e.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter(
      (e) =>
        e.name.toLowerCase().includes(q) || (e.muscleGroup ?? "").toLowerCase().includes(q)
    );
  }, [exercises, query]);

  const displayValue = open ? query : selected?.name ?? "";

  function selectExercise(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlight];
      if (option) selectExercise(option.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={`relative flex flex-col gap-1 ${wrapperClassName}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search name or muscle group…"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          className="min-h-11 w-full rounded-lg border border-border bg-surface-muted pl-9 pr-3 py-2 text-foreground placeholder:text-muted [touch-action:manipulation] focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          // Prevent the input's blur from firing before the option's click.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No exercises found</li>
          )}
          {filtered.map((exercise, index) => {
            const showHeader =
              index === 0 || exercise.muscleGroup !== filtered[index - 1].muscleGroup;
            return (
              <div key={exercise.id}>
                {showHeader && (
                  <li
                    role="presentation"
                    className="px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted"
                  >
                    {exercise.muscleGroup ?? "Other"}
                  </li>
                )}
                <li
                  role="option"
                  aria-selected={exercise.id === value}
                  onClick={() => selectExercise(exercise.id)}
                  onMouseEnter={() => setHighlight(index)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm [touch-action:manipulation] ${
                    index === highlight ? "bg-surface-muted" : ""
                  }`}
                >
                  <span>{exercise.name}</span>
                  {exercise.id === value && <Check className="h-4 w-4 text-accent" />}
                </li>
              </div>
            );
          })}
        </ul>
      )}
    </div>
  );
}
