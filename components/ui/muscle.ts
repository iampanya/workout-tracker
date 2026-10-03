import type { BadgeTone } from "./Badge";

// Per-muscle-group Tailwind classes, spelled out in full so Tailwind's scanner sees them
// (never build `bg-muscle-${x}` dynamically). Plain module: safe to import from server code.
type MuscleStyle = { tone: BadgeTone; dot: string; bar: string; tint: string; chipActive: string };

const NEUTRAL: MuscleStyle = {
  tone: "neutral",
  dot: "bg-muted",
  bar: "bg-border",
  tint: "",
  chipActive: "bg-surface-muted text-foreground ring-1 ring-inset ring-border",
};

const MUSCLE_STYLES: Record<string, MuscleStyle> = {
  Chest: {
    tone: "chest",
    dot: "bg-muscle-chest",
    bar: "bg-muscle-chest",
    tint: "bg-muscle-chest/10",
    chipActive: "bg-muscle-chest/15 text-muscle-chest ring-1 ring-inset ring-muscle-chest/40",
  },
  Back: {
    tone: "back",
    dot: "bg-muscle-back",
    bar: "bg-muscle-back",
    tint: "bg-muscle-back/10",
    chipActive: "bg-muscle-back/15 text-muscle-back ring-1 ring-inset ring-muscle-back/40",
  },
  Legs: {
    tone: "legs",
    dot: "bg-muscle-legs",
    bar: "bg-muscle-legs",
    tint: "bg-muscle-legs/10",
    chipActive: "bg-muscle-legs/15 text-muscle-legs ring-1 ring-inset ring-muscle-legs/40",
  },
  Shoulders: {
    tone: "shoulders",
    dot: "bg-muscle-shoulders",
    bar: "bg-muscle-shoulders",
    tint: "bg-muscle-shoulders/10",
    chipActive:
      "bg-muscle-shoulders/15 text-muscle-shoulders ring-1 ring-inset ring-muscle-shoulders/40",
  },
  Arms: {
    tone: "arms",
    dot: "bg-muscle-arms",
    bar: "bg-muscle-arms",
    tint: "bg-muscle-arms/10",
    chipActive: "bg-muscle-arms/15 text-muscle-arms ring-1 ring-inset ring-muscle-arms/40",
  },
  Core: {
    tone: "core",
    dot: "bg-muscle-core",
    bar: "bg-muscle-core",
    tint: "bg-muscle-core/10",
    chipActive: "bg-muscle-core/15 text-muscle-core ring-1 ring-inset ring-muscle-core/40",
  },
};

export function muscleStyle(group: string | null | undefined): MuscleStyle {
  return (group && MUSCLE_STYLES[group]) || NEUTRAL;
}

export function muscleTone(group: string | null | undefined): BadgeTone {
  return muscleStyle(group).tone;
}
