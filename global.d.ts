import type { Locale } from "@/i18n/config";
import type messages from "./messages/en.json";

// Typed message keys: a missing or misspelled key fails `tsc`. en.json is the source of
// truth; i18n/messages.test.ts keeps th.json in lockstep.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
