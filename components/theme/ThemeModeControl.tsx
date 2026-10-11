"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";
import { useTheme, type ThemeMode } from "./ThemeProvider";

const OPTIONS: { mode: ThemeMode; icon: React.ReactNode }[] = [
  { mode: "system", icon: <Desktop className="h-4 w-4" /> },
  { mode: "light", icon: <Sun className="h-4 w-4" /> },
  { mode: "dark", icon: <Moon className="h-4 w-4" /> },
];

export function ThemeModeControl() {
  const t = useTranslations("theme");
  const { mode, setMode } = useTheme();

  return (
    <div
      role="group"
      aria-label={t("group")}
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
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {option.icon}
            {t(option.mode)}
          </button>
        );
      })}
    </div>
  );
}
