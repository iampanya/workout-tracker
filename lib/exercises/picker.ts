// Pure filtering/grouping for the exercise picker (components/ui/ExercisePicker.tsx).

export type ExerciseOption = { id: string; name: string; muscleGroup: string | null };

// "all", "recent", or a muscle group name.
export type PickerFilter = string;

export type PickerSection = {
  key: string;
  label: string;
  // null for the Recent and Other sections.
  muscleGroup: string | null;
  items: ExerciseOption[];
};

// Every whitespace-separated token must appear in the name or muscle group, so "inc bench"
// finds "Incline Bench Press". Case-insensitive; a blank query matches everything.
export function matchesQuery(option: ExerciseOption, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = `${option.name} ${option.muscleGroup ?? ""}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

// Assumes `exercises` is sorted by muscle_group then name (as listExercises returns), so
// groups come out in that order. Ungrouped exercises collect under "Other", last.
export function buildPickerSections({
  exercises,
  query,
  filter,
  recentIds,
}: {
  exercises: ExerciseOption[];
  query: string;
  filter: PickerFilter;
  recentIds: string[];
}): PickerSection[] {
  const searching = query.trim() !== "";
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const recent = recentIds
    .map((id) => byId.get(id))
    .filter((e): e is ExerciseOption => e !== undefined && matchesQuery(e, query));

  if (filter === "recent") {
    return recent.length > 0 ? [recentSection(recent)] : [];
  }

  const sections: PickerSection[] = [];
  if (filter === "all" && !searching && recent.length > 0) {
    sections.push(recentSection(recent));
  }

  const groups = new Map<string, ExerciseOption[]>();
  const other: ExerciseOption[] = [];
  for (const exercise of exercises) {
    if (filter !== "all" && exercise.muscleGroup !== filter) continue;
    if (!matchesQuery(exercise, query)) continue;
    if (exercise.muscleGroup === null) {
      other.push(exercise);
    } else {
      const items = groups.get(exercise.muscleGroup) ?? [];
      items.push(exercise);
      groups.set(exercise.muscleGroup, items);
    }
  }
  for (const [group, items] of groups) {
    sections.push({ key: `group:${group}`, label: group, muscleGroup: group, items });
  }
  if (other.length > 0) {
    sections.push({ key: "group:Other", label: "Other", muscleGroup: null, items: other });
  }
  return sections;
}

function recentSection(items: ExerciseOption[]): PickerSection {
  return { key: "recent", label: "Recent", muscleGroup: null, items };
}

// Options in display order — the index space for keyboard highlight. An exercise shown both
// under Recent and its group appears twice, which is intended (each row is its own option).
export function flattenOptions(sections: PickerSection[]): ExerciseOption[] {
  return sections.flatMap((s) => s.items);
}
