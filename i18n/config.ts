// Supported UI languages. A plain module (no "use client", no server-only imports) so the
// request config, server actions and client switchers can all import it.
export const LOCALES = ["th", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "th";

export const LOCALE_COOKIE = "NEXT_LOCALE";

// Messages and Intl date/time formatting use the users' time zone, so server and client agree.
export const TIME_ZONE = "Asia/Bangkok";

// Endonyms: each language is always named in itself, never translated.
export const LOCALE_NAMES: Record<Locale, string> = { th: "ไทย", en: "English" };
export const LOCALE_SHORT_NAMES: Record<Locale, string> = { th: "ไทย", en: "EN" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
