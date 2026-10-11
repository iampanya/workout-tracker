"use client";

import { useTranslations } from "next-intl";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { useSwitchLocale } from "./useSwitchLocale";

export function LanguageControl() {
  const t = useTranslations("theme");
  const { locale, switchTo, pending } = useSwitchLocale();

  return (
    <div
      role="group"
      aria-label={t("language")}
      aria-busy={pending}
      className="flex gap-1 rounded-xl border border-border bg-surface-muted p-1"
    >
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-pressed={active}
            disabled={pending}
            onClick={() => switchTo(option)}
            className={`flex flex-1 items-center justify-center rounded-lg px-2 py-2 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 ${
              active ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {LOCALE_NAMES[option]}
          </button>
        );
      })}
    </div>
  );
}
