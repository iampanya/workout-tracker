// Color-theme (accent palette) choices. A plain module — not "use client" — so the
// server root layout can interpolate THEME_ACCENTS into its pre-paint script (importing
// a value from a "use client" module on the server yields a client reference, not data).
// The palettes themselves are `[data-accent]` blocks in app/globals.css.

export const THEME_ACCENTS = ["teal", "orange", "blue", "violet"] as const;

export type ThemeAccent = (typeof THEME_ACCENTS)[number];

export const DEFAULT_ACCENT: ThemeAccent = "teal";

export const ACCENT_STORAGE_KEY = "accent";

export function isThemeAccent(value: unknown): value is ThemeAccent {
  return typeof value === "string" && (THEME_ACCENTS as readonly string[]).includes(value);
}

/** Picker swatches — each palette's light-mode accent, shown regardless of current theme. */
export const ACCENT_SWATCHES: Record<ThemeAccent, string> = {
  teal: "#0f766e",
  orange: "#c2410c",
  blue: "#1d4ed8",
  violet: "#6d28d9",
};
