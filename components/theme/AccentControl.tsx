"use client";

import { Check } from "@phosphor-icons/react/ssr";
import { useTheme } from "./ThemeProvider";
import { ACCENT_SWATCHES, THEME_ACCENTS } from "./accents";

export function AccentControl() {
  const { accent, setAccent } = useTheme();

  return (
    <div role="group" aria-label="Color theme" className="grid grid-cols-4 gap-1">
      {THEME_ACCENTS.map((option) => {
        const active = option === accent;
        const swatch = ACCENT_SWATCHES[option];
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => setAccent(option)}
            className={`flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              active ? "bg-surface-muted text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${
                active ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""
              }`}
              style={{ background: swatch.color }}
            >
              {active && <Check weight="bold" className="h-4 w-4" />}
            </span>
            {swatch.label}
          </button>
        );
      })}
    </div>
  );
}
