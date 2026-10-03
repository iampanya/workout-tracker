"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Check,
  CircleNotch,
  ClockCounterClockwise,
  MagnifyingGlass,
  Plus,
  X,
} from "@phosphor-icons/react/ssr";
import { createCustomExercise } from "@/lib/actions/exercises";
import {
  buildPickerSections,
  flattenOptions,
  type ExerciseOption,
  type PickerFilter,
  type PickerSection,
} from "@/lib/exercises/picker";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/validation";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Sheet } from "./Sheet";
import { muscleStyle, muscleTone } from "./muscle";

export type { ExerciseOption };

// The "Add exercise" flow: a trigger button that opens a Sheet with search, muscle-group filter
// chips, a Recent section, and sticky color-coded group headers. The sheet stays open so several
// exercises can be added in a row, and a search with no exact match offers to create it.
//
// Adds are single-flight: `onAdd` callers insert at max(position) + 1, so two concurrent adds
// could collide on unique(…, position). While one is pending, the other rows are disabled.
// `exercises` must be sorted by muscle_group then name (as listExercises returns).
export function ExercisePicker({
  exercises,
  recentIds,
  addedIds,
  onAdd,
  triggerLabel = "Add exercise",
}: {
  exercises: ExerciseOption[];
  /** Most recently done first. */
  recentIds: string[];
  /** Exercises already in the session/routine — marked "Added". */
  addedIds: string[];
  /** Adds the exercise; throw to surface an error in the sheet. */
  onAdd: (exercise: ExerciseOption) => Promise<void>;
  triggerLabel?: string;
}) {
  const titleId = useId();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PickerFilter>("all");
  const [highlight, setHighlight] = useState(0);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedThisOpen, setAddedThisOpen] = useState<string[]>([]);
  // Exercises created from the sheet, shown before the server-fetched list catches up.
  const [created, setCreated] = useState<ExerciseOption[]>([]);
  const [createGroup, setCreateGroup] = useState<MuscleGroup | null>(null);
  const [createMode, setCreateMode] = useState(false);
  // The keyboard highlight only shows while the search box has focus — on touch it would
  // look like a preselected row.
  const [inputFocused, setInputFocused] = useState(false);

  const allExercises = useMemo(() => {
    const known = new Set(exercises.map((e) => e.id));
    const extra = created.filter((e) => !known.has(e.id));
    if (extra.length === 0) return exercises;
    return [...exercises, ...extra].sort(
      (a, b) =>
        (a.muscleGroup ?? "￿").localeCompare(b.muscleGroup ?? "￿") ||
        a.name.localeCompare(b.name)
    );
  }, [exercises, created]);

  const added = useMemo(() => new Set([...addedIds, ...addedThisOpen]), [addedIds, addedThisOpen]);
  const presentGroups = useMemo(
    () => MUSCLE_GROUPS.filter((g) => allExercises.some((e) => e.muscleGroup === g)),
    [allExercises]
  );
  const hasRecent = useMemo(() => {
    const ids = new Set(allExercises.map((e) => e.id));
    return recentIds.some((id) => ids.has(id));
  }, [allExercises, recentIds]);

  const sections = useMemo(
    () => buildPickerSections({ exercises: allExercises, query, filter, recentIds }),
    [allExercises, query, filter, recentIds]
  );
  const options = useMemo(() => flattenOptions(sections), [sections]);
  const activeIndex = Math.min(highlight, options.length - 1);

  const trimmedQuery = query.trim();
  const canCreate =
    trimmedQuery !== "" &&
    !allExercises.some((e) => e.name.toLowerCase() === trimmedQuery.toLowerCase());

  // Row keys/ids are per section: an exercise can appear under both Recent and its group.
  const rowKeys = useMemo(
    () => sections.flatMap((s) => s.items.map((e) => `${s.key}:${e.id}`)),
    [sections]
  );
  const indexByRowKey = useMemo(() => new Map(rowKeys.map((key, i) => [key, i])), [rowKeys]);
  const optionDomId = (index: number) => `${listId}-opt-${index}`;

  // Desktop: focus search on open. On touch devices, don't — the keyboard would cover half
  // the list before the user has even looked at it.
  useEffect(() => {
    if (open && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, [open]);

  function openSheet() {
    setQuery("");
    setFilter("all");
    setHighlight(0);
    setError(null);
    setAddedThisOpen([]);
    setCreateMode(false);
    setOpen(true);
  }

  function resetScroll() {
    setHighlight(0);
    listRef.current?.scrollTo({ top: 0 });
  }

  function selectFilter(next: PickerFilter) {
    setFilter(next);
    resetScroll();
  }

  async function add(exercise: ExerciseOption, rowKey: string) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPendingKey(rowKey);
    setError(null);
    try {
      await onAdd(exercise);
      setAddedThisOpen((prev) => [...prev, exercise.id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add exercise");
    } finally {
      pendingRef.current = false;
      setPendingKey(null);
    }
  }

  function startCreate() {
    setCreateGroup(MUSCLE_GROUPS.includes(filter as MuscleGroup) ? (filter as MuscleGroup) : null);
    setCreateMode(true);
    setError(null);
  }

  async function createAndAdd() {
    if (!createGroup || pendingRef.current) return;
    pendingRef.current = true;
    setPendingKey("create");
    setError(null);
    try {
      const exercise = await createCustomExercise({ name: trimmedQuery, muscleGroup: createGroup });
      const option = { id: exercise.id, name: exercise.name, muscleGroup: exercise.muscle_group };
      setCreated((prev) => [...prev, option]);
      setCreateMode(false);
      // Show the new exercise under its group (the query still matches its name).
      setFilter("all");
      await onAdd(option);
      setAddedThisOpen((prev) => [...prev, option.id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create exercise");
    } finally {
      pendingRef.current = false;
      setPendingKey(null);
    }
  }

  function moveHighlight(next: number) {
    setHighlight(next);
    document.getElementById(optionDomId(next))?.scrollIntoView({ block: "nearest" });
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (options.length > 0) moveHighlight(Math.min(activeIndex + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (options.length > 0) moveHighlight(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[activeIndex];
      if (option) add(option, rowKeys[activeIndex]);
      else if (canCreate) startCreate();
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        icon={<Plus className="h-4 w-4" />}
        onClick={openSheet}
        className="w-full border-dashed"
      >
        {triggerLabel}
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-2 sm:pt-4">
          <div className="flex items-baseline gap-2">
            <h2 id={titleId} className="text-lg font-semibold">
              {triggerLabel}
            </h2>
            {addedThisOpen.length > 0 && (
              <span className="text-sm text-muted tabular-nums" aria-live="polite">
                {addedThisOpen.length} added
              </span>
            )}
          </div>
          <Button
            variant={addedThisOpen.length > 0 ? "primary" : "ghost"}
            onClick={() => setOpen(false)}
            className="-mr-2"
          >
            Done
          </Button>
        </div>

        <div className="relative mx-4 mt-2 shrink-0">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search exercises"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              inputFocused && activeIndex >= 0 ? optionDomId(activeIndex) : undefined
            }
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Search exercises…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCreateMode(false);
              resetScroll();
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            className="min-h-11 w-full rounded-lg border border-border bg-surface-muted py-2 pl-9 pr-11 text-base text-foreground placeholder:text-muted [touch-action:manipulation] focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {query && (
            <IconButton
              icon={<X className="h-4 w-4" />}
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setCreateMode(false);
                resetScroll();
                inputRef.current?.focus();
              }}
              className="absolute right-0 top-0"
            />
          )}
        </div>

        <div
          role="radiogroup"
          aria-label="Filter by muscle group"
          className="flex shrink-0 snap-x gap-1.5 overflow-x-auto px-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <FilterChip label="All" active={filter === "all"} onSelect={() => selectFilter("all")} />
          {hasRecent && (
            <FilterChip
              label="Recent"
              icon={<ClockCounterClockwise className="h-3.5 w-3.5" />}
              active={filter === "recent"}
              onSelect={() => selectFilter("recent")}
            />
          )}
          {presentGroups.map((group) => (
            <FilterChip
              key={group}
              label={group}
              dotClass={muscleStyle(group).dot}
              activeClass={muscleStyle(group).chipActive}
              active={filter === group}
              onSelect={() => selectFilter(group)}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="shrink-0 px-4 pb-1 text-sm text-danger">
            {error}
          </p>
        )}

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Exercises"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border"
        >
          {sections.map((section) => (
            <div key={section.key} role="group" aria-labelledby={`${listId}-${section.key}`}>
              <SectionHeader id={`${listId}-${section.key}`} section={section} />
              {section.items.map((exercise) => {
                const rowKey = `${section.key}:${exercise.id}`;
                const index = indexByRowKey.get(rowKey)!;
                const isPending = pendingKey === rowKey;
                const isAdded = added.has(exercise.id);
                const disabled = pendingKey !== null && !isPending;
                return (
                  <div
                    key={rowKey}
                    id={optionDomId(index)}
                    role="option"
                    aria-selected={inputFocused && index === activeIndex}
                    aria-disabled={disabled || undefined}
                    onClick={() => !disabled && add(exercise, rowKey)}
                    className={`flex min-h-12 scroll-mt-10 cursor-pointer items-center justify-between gap-3 px-4 py-2 [touch-action:manipulation] ${
                      inputFocused && index === activeIndex ? "bg-surface-muted" : "hover:bg-surface-muted"
                    } ${disabled ? "opacity-50" : ""}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{exercise.name}</span>
                      {section.key === "recent" && exercise.muscleGroup && (
                        <Badge tone={muscleTone(exercise.muscleGroup)}>{exercise.muscleGroup}</Badge>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {isAdded && (
                        <Badge tone="success" icon={<Check className="h-3 w-3" weight="bold" />}>
                          Added
                        </Badge>
                      )}
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          isAdded ? "text-muted" : "bg-accent/10 text-accent"
                        }`}
                        aria-hidden="true"
                      >
                        {isPending ? (
                          <CircleNotch className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" weight="bold" />
                        )}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {sections.length === 0 && (
            <div className="px-4 pt-6 pb-2 text-center text-sm text-muted">
              <p>
                {trimmedQuery
                  ? `No exercises match “${trimmedQuery}”${filter === "all" ? "" : ` in ${filter === "recent" ? "Recent" : filter}`}.`
                  : filter === "recent"
                    ? "No recent exercises yet."
                    : "No exercises yet."}
              </p>
              {trimmedQuery && filter !== "all" && (
                <button
                  type="button"
                  onClick={() => selectFilter("all")}
                  className="mt-1 min-h-11 font-medium text-accent [touch-action:manipulation]"
                >
                  Search all groups
                </button>
              )}
            </div>
          )}

          {canCreate && (
            <div className="border-t border-border px-4 py-3">
              {createMode ? (
                <div className="space-y-3">
                  <p className="text-sm">
                    Create <span className="font-semibold">“{trimmedQuery}”</span> — which muscle group?
                  </p>
                  <div role="radiogroup" aria-label="Muscle group" className="flex flex-wrap gap-1.5">
                    {MUSCLE_GROUPS.map((group) => (
                      <FilterChip
                        key={group}
                        label={group}
                        dotClass={muscleStyle(group).dot}
                        activeClass={muscleStyle(group).chipActive}
                        active={createGroup === group}
                        onSelect={() => setCreateGroup(group)}
                      />
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setCreateMode(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={createAndAdd}
                      disabled={!createGroup}
                      loading={pendingKey === "create"}
                    >
                      Create &amp; add
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startCreate}
                  disabled={pendingKey !== null}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-accent [touch-action:manipulation] hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" weight="bold" />
                  <span className="truncate">Create “{trimmedQuery}”</span>
                </button>
              )}
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}

function SectionHeader({ id, section }: { id: string; section: PickerSection }) {
  const isRecent = section.key === "recent";
  const style = muscleStyle(section.muscleGroup);
  return (
    <div
      id={id}
      className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface py-2 pl-4 pr-4"
    >
      {/* Tint layered over the opaque surface so rows scrolling underneath never show through. */}
      <span
        className={`absolute inset-0 ${isRecent ? "bg-accent/10" : style.tint}`}
        aria-hidden="true"
      />
      <span
        className={`absolute inset-y-0 left-0 w-1 ${isRecent ? "bg-accent" : style.bar}`}
        aria-hidden="true"
      />
      {isRecent ? (
        <ClockCounterClockwise className="relative h-4 w-4 text-accent" aria-hidden="true" />
      ) : (
        <span className={`relative h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
      )}
      <span className="relative text-sm font-semibold tracking-wide text-foreground uppercase">
        {section.label}
      </span>
      <span className="relative ml-auto text-xs text-muted tabular-nums">
        {section.items.length}
      </span>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onSelect,
  icon,
  dotClass,
  activeClass = "bg-accent text-accent-foreground",
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  dotClass?: string;
  activeClass?: string;
}) {
  // 44px-tall hit area around a 32px pill.
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onSelect}
      className="group flex h-11 shrink-0 snap-start items-center rounded-full [touch-action:manipulation] focus-visible:outline-none"
    >
      <span
        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition group-focus-visible:ring-2 group-focus-visible:ring-ring ${
          active ? activeClass : "bg-surface-muted text-muted hover:text-foreground"
        }`}
      >
        {dotClass && <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />}
        {icon}
        {label}
      </span>
    </button>
  );
}
