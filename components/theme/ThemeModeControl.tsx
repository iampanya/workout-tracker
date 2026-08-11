"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react/ssr";
import { useTheme, type ThemeMode } from "./ThemeProvider";

const OPTIONS: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { mode: "system", label: "System", icon: <Desktop className="h-4 w-4" /> },
  { mode: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
  { mode: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
];

export function ThemeModeControl() {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex gap-1 rounded-xl border border-border bg-surface-muted p-1"
    >
      {OPTIONS.map((option) => {
        const active = option.mode === mode;
        return (
          <button
            key={option.mode}
            type="button"
            aria-pressed={active}
            onClick={() => setMode(option.mode)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
