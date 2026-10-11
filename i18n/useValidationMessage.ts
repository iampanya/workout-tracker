"use client";

import { useTranslations } from "next-intl";
import { isValidationKey } from "@/lib/validation";

// react-hook-form + zodResolver surface the schema's message, which is a ValidationKey for our own
// rules; translate those. Anything else (zod's built-in English) passes through unchanged.
export function useValidationMessage() {
  const t = useTranslations("validation");
  return (message: string | undefined) =>
    message === undefined ? undefined : isValidationKey(message) ? t(message) : message;
}
