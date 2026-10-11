"use client";

import { useTranslations } from "next-intl";
import { LOCALE_NAMES, LOCALE_SHORT_NAMES } from "@/i18n/config";
import { useSwitchLocale } from "./useSwitchLocale";

// Compact switch for the logged-out pages: shows the language you'd switch *to*.
export function LanguageToggleButton() {
  const t = useTranslations("theme");
  const { locale, switchTo, pending } = useSwitchLocale();
  const next = locale === "th" ? "en" : "th";

  return (
    <button
      type="button"
      lang={next}
      disabled={pending}
      onClick={() => switchTo(next)}
      aria-label={t("switchLanguage", { language: LOCALE_NAMES[next] })}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-muted transition [touch-action:manipulation] hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      {LOCALE_SHORT_NAMES[next]}
    </button>
  );
}
