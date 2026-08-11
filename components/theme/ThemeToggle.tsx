"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react/ssr";
import { useTheme, type ThemeMode } from "./ThemeProvider";

// Compact icon toggle for chrome that can't spare room for the full
// segmented ThemeModeControl (e.g. the landing nav). Cycles the same three
// modes and shares the ThemeProvider store, so it stays in sync with Settings.
const NEXT: Record<ThemeMode, ThemeMode> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const META: Record<ThemeMode, { label: string; icon: React.ReactNode }> = {
  system: { label: "System theme", icon: <Desktop className="h-4 w-4" /> },
  light: { label: "Light theme", icon: <Sun className="h-4 w-4" /> },
  dark: { label: "Dark theme", icon: <Moon className="h-4 w-4" /> },
};

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const { label, icon } = META[mode];

  return (
    <button
      type="button"
      onClick={() => setMode(NEXT[mode])}
      aria-label={`${label} (tap to change)`}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-muted transition [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {icon}
    </button>
  );
}
