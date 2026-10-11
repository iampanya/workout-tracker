import { describe, it, expect } from "vitest";
import { buildPickerSections, flattenOptions, matchesQuery, type ExerciseOption } from "./picker";

const ex = (id: string, name: string, muscleGroup: string | null): ExerciseOption => ({
  id,
  name,
  muscleGroup,
});

// Sorted by muscle_group then name, as listExercises returns (nulls last in Postgres asc order).
const EXERCISES = [
  ex("a1", "Bicep Curl", "Arms"),
  ex("b1", "Barbell Row", "Back"),
  ex("b2", "Deadlift", "Back"),
  ex("c1", "Bench Press", "Chest"),
  ex("c2", "Incline Bench Press", "Chest"),
  ex("l1", "Squat", "Legs"),
  ex("o1", "Farmer Carry", null),
];

const keys = (sections: ReturnType<typeof buildPickerSections>) => sections.map((s) => s.key);
const ids = (sections: ReturnType<typeof buildPickerSections>) =>
  flattenOptions(sections).map((o) => o.id);

describe("matchesQuery", () => {
  it("matches every whitespace-separated token against name or muscle group", () => {
    expect(matchesQuery(ex("x", "Incline Bench Press", "Chest"), "inc bench")).toBe(true);
    expect(matchesQuery(ex("x", "Incline Bench Press", "Chest"), "chest incline")).toBe(true);
    expect(matchesQuery(ex("x", "Bench Press", "Chest"), "inc bench")).toBe(false);
  });

  it("treats a blank query as a match", () => {
    expect(matchesQuery(ex("x", "Squat", "Legs"), "   ")).toBe(true);
  });

  it("also matches the translated muscle group name when a labeler is given", () => {
    const thai = (group: string) => ({ Legs: "ขา", Chest: "อก" })[group] ?? group;
    expect(matchesQuery(ex("x", "Squat", "Legs"), "ขา", thai)).toBe(true);
    expect(matchesQuery(ex("x", "Squat", "Legs"), "อก", thai)).toBe(false);
    expect(matchesQuery(ex("x", "Farmer Carry", null), "ขา", thai)).toBe(false);
  });
});

describe("buildPickerSections", () => {
  it("groups by muscle group, with ungrouped exercises last under Other", () => {
    const sections = buildPickerSections({ exercises: EXERCISES, query: "", filter: "all", recentIds: [] });
    expect(keys(sections)).toEqual(["group:Arms", "group:Back", "group:Chest", "group:Legs", "group:Other"]);
    expect(sections[4]).toMatchObject({ key: "group:Other", muscleGroup: null });
  });

  it("puts a Recent section first, in recentIds order, only when unfiltered and not searching", () => {
    const recentIds = ["l1", "c1", "missing"];
    const all = buildPickerSections({ exercises: EXERCISES, query: "", filter: "all", recentIds });
    expect(all[0]).toMatchObject({ key: "recent", muscleGroup: null });
    expect(all[0].items.map((o) => o.id)).toEqual(["l1", "c1"]);

    const searching = buildPickerSections({ exercises: EXERCISES, query: "squat", filter: "all", recentIds });
    expect(keys(searching)).toEqual(["group:Legs"]);
  });

  it("limits to one muscle group when filtered", () => {
    const sections = buildPickerSections({ exercises: EXERCISES, query: "", filter: "Back", recentIds: ["c1"] });
    expect(ids(sections)).toEqual(["b1", "b2"]);
  });

  it("shows only recent exercises (still searchable) when filtered to recent", () => {
    const recentIds = ["l1", "c1", "c2"];
    expect(ids(buildPickerSections({ exercises: EXERCISES, query: "", filter: "recent", recentIds }))).toEqual([
      "l1",
      "c1",
      "c2",
    ]);
    expect(
      ids(buildPickerSections({ exercises: EXERCISES, query: "incline", filter: "recent", recentIds }))
    ).toEqual(["c2"]);
  });

  it("returns no sections when nothing matches", () => {
    expect(buildPickerSections({ exercises: EXERCISES, query: "cable fly", filter: "all", recentIds: [] })).toEqual(
      []
    );
  });

  it("passes the muscle labeler through to search", () => {
    const thai = (group: string) => ({ Legs: "ขา" })[group] ?? group;
    const sections = buildPickerSections({
      exercises: EXERCISES,
      query: "ขา",
      filter: "all",
      recentIds: [],
      muscleLabel: thai,
    });
    expect(ids(sections)).toEqual(["l1"]);
  });
});
