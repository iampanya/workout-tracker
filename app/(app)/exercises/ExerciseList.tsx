"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CaretRight, MagnifyingGlass, Trophy } from "@phosphor-icons/react/ssr";
import type { ExerciseStats } from "@/lib/exercises/service";
import { formatRelativeDate } from "@/lib/sessions/summary";
import { formatPr } from "@/lib/pr";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArchiveExerciseButton } from "./ArchiveExerciseButton";

const MUSCLE_GROUPS = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"] as const;

const MUSCLE_GROUP_TONE: Record<string, BadgeTone> = {
  Chest: "chest",
  Back: "back",
  Legs: "legs",
  Shoulders: "shoulders",
  Arms: "arms",
  Core: "core",
};

type ExerciseRow = {
  id: string;
  name: string;
  muscle_group: string | null;
  is_preset: boolean;
};

// Searchable, filterable exercise index. `exercises` arrive sorted by muscle group then name
// (listExercises), so filtered results keep that grouping.
export function ExerciseList({
  exercises,
  stats,
  today,
}: {
  exercises: ExerciseRow[];
  stats: Record<string, ExerciseStats>;
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        (group === null || e.muscle_group === group) &&
        (q === "" || e.name.toLowerCase().includes(q))
    );
  }, [exercises, query, group]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          aria-label="Search exercises"
          className="min-h-11 w-full rounded-lg border border-border bg-surface-muted py-2 pl-9 pr-3 text-base text-foreground placeholder:text-muted [touch-action:manipulation] focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div
        role="radiogroup"
        aria-label="Filter by muscle group"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {[null, ...MUSCLE_GROUPS].map((option) => {
          const active = group === option;
          return (
            <button
              key={option ?? "all"}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setGroup(option)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {option ?? "All"}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass className="h-6 w-6" />}
          title="No matching exercises"
          description="Try another name or muscle group — or add it as a new exercise."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((exercise) => {
            const stat = stats[exercise.id];
            return (
              <Card
                key={exercise.id}
                padding={false}
                className="flex items-center justify-between gap-2"
              >
                <Link
                  href={`/exercises/${exercise.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 p-4"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate">{exercise.name}</span>
                      {exercise.muscle_group && (
                        <Badge tone={MUSCLE_GROUP_TONE[exercise.muscle_group] ?? "neutral"}>
                          {exercise.muscle_group}
                        </Badge>
                      )}
                    </span>
                    {stat && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted tabular-nums">
                        {stat.pr !== null && (
                          <>
                            <Trophy className="h-3.5 w-3.5" aria-hidden />
                            PR {formatPr(stat.pr)}
                          </>
                        )}
                        {stat.pr !== null && stat.lastDate && " · "}
                        {stat.lastDate && `Last ${formatRelativeDate(stat.lastDate, today)}`}
                      </span>
                    )}
                  </span>
                  <CaretRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
                {!exercise.is_preset && (
                  <div className="pr-2">
                    <ArchiveExerciseButton exerciseId={exercise.id} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
