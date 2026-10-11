"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/config";
import { setLocale } from "@/lib/actions/locale";

// Writes the locale cookie, then refreshes so server components re-render in the new language.
export function useSwitchLocale() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      try {
        await setLocale(next);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  return { locale, switchTo, pending };
}
