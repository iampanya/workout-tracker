"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  isThemeAccent,
  type ThemeAccent,
} from "./accents";

export type ThemeMode = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as string[]).includes(value);
}

// The saved mode lives in localStorage — an external store. We read it through
// useSyncExternalStore so the value is hydration-safe (server renders "system",
// client reconciles to the stored value) without a setState-in-effect.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "system";
}

function getServerSnapshot(): ThemeMode {
  return "system";
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Resolve a mode to the concrete theme actually painted. */
function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return prefersDark() ? "dark" : "light";
  return mode;
}

/** Write the concrete theme onto <html data-theme> so the CSS selectors apply. */
function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(mode);
}

/** Persist a mode, repaint, and notify subscribers. Stable module-level fn. */
function setStoredMode(mode: ThemeMode) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }
  applyTheme(mode);
  listeners.forEach((listener) => listener());
}

// The color theme (accent palette) is a second localStorage-backed value on the same
// listeners, applied as <html data-accent> (see accents.ts / globals.css).
function getAccentSnapshot(): ThemeAccent {
  if (typeof window === "undefined") return DEFAULT_ACCENT;
  const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
  return isThemeAccent(stored) ? stored : DEFAULT_ACCENT;
}

function getAccentServerSnapshot(): ThemeAccent {
  return DEFAULT_ACCENT;
}

/** Persist an accent, repaint, and notify subscribers. Stable module-level fn. */
function setStoredAccent(accent: ThemeAccent) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  }
  if (typeof document !== "undefined") {
    document.documentElement.dataset.accent = accent;
  }
  listeners.forEach((listener) => listener());
}

/** Mounted once in the root layout: keeps "system" mode following live OS changes. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { mode } = useTheme();

  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  return <>{children}</>;
}

export function useTheme(): {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  accent: ThemeAccent;
  setAccent: (accent: ThemeAccent) => void;
} {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const accent = useSyncExternalStore(subscribe, getAccentSnapshot, getAccentServerSnapshot);
  return { mode, setMode: setStoredMode, accent, setAccent: setStoredAccent };
}
