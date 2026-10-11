# Thai / English Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thai-first UI that users can switch to English, with every user-visible string in `messages/{th,en}.json`.

**Architecture:** `next-intl` 4 in "without i18n routing" mode. The locale comes from a `NEXT_LOCALE` cookie (default `th`), is resolved in `i18n/request.ts`, and is provided to client components through `NextIntlClientProvider` in the root layout. Pure `lib/` formatters stay framework-free: they take a `locale` string and use `Intl`, while all words come from message files. A parity test keeps `th.json` and `en.json` in lockstep (same keys, same ICU arguments, both parse).

**Tech Stack:** Next.js 16.3 App Router, next-intl ^4.14.9, `@formatjs/icu-messageformat-parser` (dev, for the parity test), `next/font/google` IBM Plex Sans Thai, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-thai-localization-design.md`

## Global Constraints

- Locales `["th", "en"]`, default `th`, cookie `NEXT_LOCALE` (1 year, `path=/`, `sameSite=lax`). No `/th` URL prefixes; `proxy.ts` is untouched.
- Message time zone `Asia/Bangkok` (`TIME_ZONE` in `i18n/config.ts`).
- Thai dates use the Buddhist Era via `Intl` locale `"th"` (e.g. `"11 ส.ค. 2569"`). Format a `YYYY-MM-DD` string by building `new Date(Date.UTC(y, m-1, d))` and formatting with `timeZone: "UTC"`. Never `new Date(str)`.
- **Never translated:** user content (routine/exercise/session names, notes), the 15 preset exercise names, the unit `kg`, the warmup marker `W`, `PR`, the backup JSON format, and server-thrown `Error` text.
- Muscle groups stay English in the DB and in `MUSCLE_GROUPS`. Display them via `muscleLabel(tm, group)` with `tm = useTranslations("muscle")` / `await getTranslations("muscle")`.
- Glossary for `th.json`: Dashboard หน้าหลัก · Routines โปรแกรม · Exercises ท่าออกกำลังกาย (bottom-nav label only: ท่าฝึก) · History ประวัติ · Settings ตั้งค่า · Profile โปรไฟล์ · Workout การฝึก (Start เริ่มฝึก · Finish จบการฝึก · Discard ยกเลิกการฝึก) · Freeform Workout ฝึกอิสระ · Set เซ็ต · Reps ครั้ง · Warmup วอร์มอัพ · Volume ปริมาณรวม · PR PR · Streak ต่อเนื่อง · Rest timer จับเวลาพัก · Today/Yesterday วันนี้/เมื่อวาน · Recent ล่าสุด · Other อื่นๆ · Chest อก · Back หลัง · Legs ขา · Shoulders ไหล่ · Arms แขน · Core แกนกลางลำตัว.
- Every message goes into **both** `messages/en.json` and `messages/th.json`, with identical keys and identical ICU arguments. Thai plurals use only the `other` branch. Keys never contain `.`. Never put an apostrophe directly before `{`.
- Pass years and other "not a quantity" numbers to ICU as **strings** (`String(year)`). A number in a simple `{arg}` is formatted with grouping ("2,026").
- Async server components use `getTranslations` / `getFormatter` / `getLocale` from `next-intl/server`. Client components **and non-async server components** use `useTranslations` / `useFormatter` / `useLocale` from `next-intl`.
- `lib/**` stays free of `next-intl` imports.
- Client error handling: `console.error(err); setError(te("<key>"))` with `te = useTranslations("errors")`. Never render `err.message`, because production Next redacts server-action messages and it would show an English generic.
- After a task's `.tsx` changes, that file has no hardcoded user-visible English (aria-labels, titles and placeholders included).
- A new pure test file goes in the `npm test` file list **and** gets an `--exclude` in `test:db` (`package.json`).
- After adding or removing a dependency: kill `next dev`, `rm -rf .next`, restart.
- ESLint only (no Prettier). Icons come from `@phosphor-icons/react/ssr`.
- Branch `feat/i18n-thai`. One commit per task, ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Every task's gate: `npx tsc --noEmit && npm run lint && npm test` all pass.

## File Structure

| File | Responsibility |
|---|---|
| `i18n/config.ts` (new) | Locale list, default, cookie name, endonyms, time zone, `isLocale` — plain module |
| `i18n/request.ts` (new) | next-intl request config: cookie → locale → messages |
| `i18n/messages.test.ts` (new) | Parity + render tests for message files, `isLocale` |
| `i18n/useValidationMessage.ts` (new) | Client hook: zod message key → translated text |
| `global.d.ts` (new) | next-intl `AppConfig` augmentation (typed keys) |
| `messages/en.json`, `messages/th.json` (new) | All UI strings, one namespace per surface |
| `lib/actions/locale.ts` (new) | `setLocale` server action (writes the cookie) |
| `components/theme/useSwitchLocale.ts` (new) | Client hook: switch locale + refresh |
| `components/theme/LanguageControl.tsx` (new) | Segmented "ไทย / English" control (Settings) |
| `components/theme/LanguageToggleButton.tsx` (new) | Compact toggle (landing nav, login) |
| `app/(app)/routines/RoutinePreviewText.tsx` (new) | "N exercises · names…" for routine rows |
| `lib/sessions/summary.ts` | Locale-aware date formatters; `countSets`, `splitDuration`, `formatAxisDate` |
| `lib/routines/preview.ts` | `routinePreviewNames` (names part only) |
| `lib/sessions/history.ts` | `sessionDisplayName(session, freeformLabel)` |
| `lib/exercises/picker.ts` | Sections without English labels; search matches translated muscle names |
| `lib/validation.ts` | `isMuscleGroup`, `VALIDATION_KEYS` / `isValidationKey`; zod messages become keys |
| `components/ui/muscle.ts` | `muscleLabel(t, group)` |
| `lib/backup/service.ts`, `lib/actions/backup.ts`, `lib/actions/referrals.ts` | Return error **codes** instead of English text |

---

### Task 1: next-intl plumbing, Thai font, language switch in Settings

**Files:**
- Modify: `package.json`, `next.config.ts`, `app/layout.tsx`, `app/globals.css`, `components/theme/ThemeModeControl.tsx`, `components/theme/AccentControl.tsx`, `components/theme/accents.ts`, `components/theme/ThemeToggleButton.tsx`, `app/(app)/settings/page.tsx`
- Create: `i18n/config.ts`, `i18n/request.ts`, `global.d.ts`, `messages/en.json`, `messages/th.json`, `i18n/messages.test.ts`, `lib/actions/locale.ts`, `components/theme/useSwitchLocale.ts`, `components/theme/LanguageControl.tsx`, `components/theme/LanguageToggleButton.tsx`

**Interfaces:**
- Produces: `LOCALES`, `type Locale`, `DEFAULT_LOCALE`, `LOCALE_COOKIE`, `LOCALE_NAMES`, `LOCALE_SHORT_NAMES`, `TIME_ZONE`, `isLocale(value: unknown): value is Locale` (`i18n/config.ts`); `setLocale(locale: string): Promise<void>` (`lib/actions/locale.ts`); `useSwitchLocale(): { locale: Locale; switchTo(next: Locale): void; pending: boolean }`; `<LanguageControl />`, `<LanguageToggleButton />`; namespaces `meta`, `theme`, `settings` (partial; Task 10 adds `settings.backup`).

- [ ] **Step 1: Install dependencies**

```bash
npm i next-intl@^4.14.9
npm i -D @formatjs/icu-messageformat-parser@^3.5.21
```

If `next dev` is running, stop it and `rm -rf .next` (CLAUDE.md: Turbopack serves stale chunks after dependency changes).

- [ ] **Step 2: Register the parity test in `package.json`**

In `"test"`, append ` i18n/messages.test.ts` to the end of the file list. In `"test:db"`, append ` --exclude i18n/messages.test.ts` to the end.

- [ ] **Step 3: Write the failing test** `i18n/messages.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import { DEFAULT_LOCALE, isLocale } from "./config";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

// ICU argument names and rich-text tags used by a message (parse throws on invalid ICU).
function signature(message: string): string[] {
  const found = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
      if (el.type === TYPE.tag) {
        found.add(`<${el.value}>`);
        walk(el.children);
        continue;
      }
      found.add(el.value);
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        for (const option of Object.values(el.options)) walk(option.value);
      }
    }
  };
  walk(parse(message));
  return [...found].sort();
}

const flatEn = flatten(en as Tree);
const flatTh = flatten(th as Tree);

describe("messages", () => {
  it("th and en have exactly the same keys", () => {
    expect(Object.keys(flatTh).sort()).toEqual(Object.keys(flatEn).sort());
  });

  it("every message is non-empty", () => {
    for (const [key, message] of [...Object.entries(flatEn), ...Object.entries(flatTh)]) {
      expect({ key, empty: message.trim() === "" }).toEqual({ key, empty: false });
    }
  });

  it("th uses the same ICU arguments and tags as en, and both parse", () => {
    for (const [key, message] of Object.entries(flatEn)) {
      expect({ key, signature: signature(flatTh[key] ?? "") }).toEqual({
        key,
        signature: signature(message),
      });
    }
  });
});

describe("isLocale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("th")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("defaults to Thai", () => {
    expect(DEFAULT_LOCALE).toBe("th");
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run i18n/messages.test.ts`
Expected: FAIL because `@/messages/en.json` and `./config` cannot be resolved.

- [ ] **Step 5: Create `i18n/config.ts`**

```ts
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
```

- [ ] **Step 6: Create `messages/en.json`**

```json
{
  "meta": {
    "title": "Weight Training Tracker",
    "description": "Personal weight-training log with progressive overload tracking."
  },
  "theme": {
    "group": "Theme",
    "system": "System",
    "light": "Light",
    "dark": "Dark",
    "toggle": "Theme: {current} — switch to {next}",
    "colorGroup": "Color theme",
    "accents": {
      "teal": "Teal",
      "orange": "Orange",
      "blue": "Blue",
      "violet": "Violet"
    },
    "language": "Language",
    "switchLanguage": "Switch language to {language}"
  },
  "settings": {
    "title": "Settings",
    "appearance": "Appearance",
    "mode": "Mode",
    "color": "Color",
    "language": "Language",
    "backupRestore": "Backup & Restore",
    "account": "Account"
  }
}
```

- [ ] **Step 7: Create `messages/th.json`**

```json
{
  "meta": {
    "title": "Weight Training Tracker",
    "description": "สมุดบันทึกเวทเทรนนิ่งส่วนตัว พร้อมติดตาม progressive overload"
  },
  "theme": {
    "group": "ธีม",
    "system": "ตามระบบ",
    "light": "สว่าง",
    "dark": "มืด",
    "toggle": "ธีม: {current} — เปลี่ยนเป็น {next}",
    "colorGroup": "สีธีม",
    "accents": {
      "teal": "เขียวหัวเป็ด",
      "orange": "ส้ม",
      "blue": "น้ำเงิน",
      "violet": "ม่วง"
    },
    "language": "ภาษา",
    "switchLanguage": "เปลี่ยนภาษาเป็น {language}"
  },
  "settings": {
    "title": "ตั้งค่า",
    "appearance": "การแสดงผล",
    "mode": "โหมด",
    "color": "สี",
    "language": "ภาษา",
    "backupRestore": "สำรองและกู้คืนข้อมูล",
    "account": "บัญชี"
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run i18n/messages.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Create `i18n/request.ts`**

```ts
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, TIME_ZONE, isLocale } from "./config";

// Cookie-based locale, no URL prefixes: setLocale (lib/actions/locale.ts) writes the cookie,
// and a missing or unknown value falls back to Thai.
export default getRequestConfig(async () => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : DEFAULT_LOCALE;
  return {
    locale,
    timeZone: TIME_ZONE,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 10: Create `global.d.ts`**

```ts
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
```

- [ ] **Step 11: Wire the plugin in `next.config.ts`**

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Picks up ./i18n/request.ts (cookie-based locale, see i18n/config.ts).
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 12: Update `app/layout.tsx`**: locale, provider, metadata, Thai font

Replace the imports and the `metadata` export and `RootLayout` with:

```tsx
import type { Metadata } from "next";
import { Fira_Sans, Fira_Code, IBM_Plex_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, THEME_ACCENTS } from "@/components/theme/accents";
```

Keep `THEME_INIT_SCRIPT`, `firaSans` and `firaCode` unchanged. Below `firaCode`, add:

```tsx
// Fira Sans has no Thai glyphs: Thai text falls through to Plex Thai (see --font-sans).
const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  weight: ["400", "500", "600", "700"],
  subsets: ["thai"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${firaSans.variable} ${firaCode.variable} ${plexThai.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

Delete the old static `export const metadata`.

- [ ] **Step 13: Add the Thai fallback font in `app/globals.css`**

Change line 54 from `  --font-sans: var(--font-fira-sans);` to:

```css
  --font-sans: var(--font-fira-sans), var(--font-thai);
```

- [ ] **Step 14: Create `lib/actions/locale.ts`**

```ts
"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

// Persists the UI language per device (like theme/accent): no DB column, just a cookie that
// i18n/request.ts reads. Callers router.refresh() afterwards to re-render server text.
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) throw new Error(`Unsupported locale: ${locale}`);
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
```

- [ ] **Step 15: Create `components/theme/useSwitchLocale.ts`**

```ts
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
      await setLocale(next);
      router.refresh();
    });
  }

  return { locale, switchTo, pending };
}
```

- [ ] **Step 16: Create `components/theme/LanguageControl.tsx`** (same look as `ThemeModeControl`)

```tsx
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
```

- [ ] **Step 17: Create `components/theme/LanguageToggleButton.tsx`** (used in Task 4)

```tsx
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
```

- [ ] **Step 18: Translate the theme controls**

`components/theme/accents.ts`: change `ACCENT_SWATCHES` to colors only (labels move to `theme.accents.*`):

```ts
/** Picker swatches — each palette's light-mode accent, shown regardless of current theme. */
export const ACCENT_SWATCHES: Record<ThemeAccent, string> = {
  teal: "#0f766e",
  orange: "#c2410c",
  blue: "#1d4ed8",
  violet: "#6d28d9",
};
```

`components/theme/AccentControl.tsx`: add `import { useTranslations } from "next-intl";`, and `const t = useTranslations("theme");` at the top of the component. Then:
- `aria-label="Color theme"` → `aria-label={t("colorGroup")}`
- `const swatch = ACCENT_SWATCHES[option];` → `const color = ACCENT_SWATCHES[option];`
- `style={{ background: swatch.color }}` → `style={{ background: color }}`
- `{swatch.label}` → `{t(`accents.${option}`)}`

`components/theme/ThemeModeControl.tsx`: replace the `OPTIONS` constant and the start of the component with:

```tsx
const OPTIONS: { mode: ThemeMode; icon: React.ReactNode }[] = [
  { mode: "system", icon: <Desktop className="h-4 w-4" /> },
  { mode: "light", icon: <Sun className="h-4 w-4" /> },
  { mode: "dark", icon: <Moon className="h-4 w-4" /> },
];

export function ThemeModeControl() {
  const t = useTranslations("theme");
  const { mode, setMode } = useTheme();
```

Add `import { useTranslations } from "next-intl";`. Then `aria-label="Theme"` → `aria-label={t("group")}` and `{option.label}` → `{t(option.mode)}`.

`components/theme/ThemeToggleButton.tsx`: delete `MODE_LABEL`, add `import { useTranslations } from "next-intl";`, and in the component:

```tsx
  const t = useTranslations("theme");
  const { mode, setMode } = useTheme();

  return (
    <IconButton
      icon={MODE_ICON[mode]}
      aria-label={t("toggle", { current: t(mode), next: t(NEXT_MODE[mode]) })}
      onClick={() => setMode(NEXT_MODE[mode])}
    />
  );
```

- [ ] **Step 19: Translate `app/(app)/settings/page.tsx` and add the language control**

Add the imports `import { getTranslations } from "next-intl/server";` and `import { LanguageControl } from "@/components/theme/LanguageControl";`. After the `redirect` guard, add `const t = await getTranslations("settings");`. Then replace:

| Old | New |
|---|---|
| `>Settings<` (h1) | `>{t("title")}<` |
| `Appearance` | `{t("appearance")}` |
| `Mode` | `{t("mode")}` |
| `Color` | `{t("color")}` |
| `Backup &amp; Restore` | `{t("backupRestore")}` |
| `Account` | `{t("account")}` |

Inside the Appearance card, after the Color block, add:

```tsx
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t("language")}</span>
          <LanguageControl />
        </div>
```

- [ ] **Step 20: Gate**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass. If `tsc` reports `t(\`accents.${option}\`)` as not assignable, write it as `t(\`accents.${option}\` as const)`.

- [ ] **Step 21: Browser check**

Start the dev server with `preview_start` (the `.claude/launch.json` config; if there is none, create one with `npm run dev` on port 3000) and sign in with Google.
- Open `/settings`. `document.documentElement.lang` is `"th"`, and the headings show "ตั้งค่า", "การแสดงผล" and "ภาษา".
- Tap **English**. Headings switch to English after the refresh, and `lang` becomes `"en"`.
- Reload: it stays English. Switch back to ไทย.
- With `javascript_tool`, run `getComputedStyle(document.querySelector("h1")).fontFamily`. It includes the Plex Thai family.
- The console shows no hydration warnings.

- [ ] **Step 22: Commit**

```bash
git add package.json package-lock.json next.config.ts global.d.ts i18n messages lib/actions/locale.ts app/layout.tsx app/globals.css components/theme "app/(app)/settings/page.tsx"
git commit -m "feat(i18n): next-intl plumbing, Thai font, language switch in settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Locale-aware pure formatters (+ every caller)

**Files:**
- Modify: `lib/sessions/summary.ts`, `lib/sessions/summary.test.ts`, `lib/routines/preview.ts`, `lib/routines/preview.test.ts`, `lib/sessions/history.ts`, `messages/en.json`, `messages/th.json`, `i18n/messages.test.ts`
- Create: `app/(app)/routines/RoutinePreviewText.tsx`
- Modify (callers): `app/(app)/dashboard/page.tsx`, `app/(app)/dashboard/WeeklyVolumeChartInner.tsx`, `app/(app)/history/page.tsx`, `app/(app)/history/[sessionId]/page.tsx`, `app/(app)/exercises/ExerciseList.tsx`, `app/(app)/exercises/[exerciseId]/page.tsx`, `app/(app)/exercises/[exerciseId]/ProgressChartInner.tsx`, `app/(app)/routines/page.tsx`, `app/(app)/log/page.tsx`, `app/(app)/log/StartSessionButtons.tsx`, `app/(app)/log/[sessionId]/page.tsx`, `app/(app)/log/[sessionId]/LoggingClient.tsx`, `app/(app)/log/[sessionId]/ExerciseCard.tsx`

**Interfaces:**
- Consumes: next-intl setup from Task 1.
- Produces:
  - `formatSessionDate(dateStr: string, locale: string): string`
  - `formatShortDate(dateStr: string, locale: string): string`
  - `formatMonthHeading(dateStr: string, locale: string): string`
  - `formatAxisDate(dateStr: string, locale: string): string`
  - `formatRelativeDate(dateStr: string, today: string, locale: string, labels: { today: string; yesterday: string }): string`
  - `countSets(sets: { is_warmup: boolean }[]): { working: number; warmups: number }`
  - `splitDuration(minutes: number): { hours: number; minutes: number; mm: string }`
  - `routinePreviewNames(routine: { exerciseCount: number; exerciseNames: string[] }): string | null`
  - `sessionDisplayName(session: { name: string | null; routineName?: string | null }, freeformLabel: string): string`
  - `<RoutinePreviewText routine={{ exerciseCount, exerciseNames }} />`
  - Namespace `common`: `today`, `yesterday`, `freeformWorkout`, `noExercisesYet`, `exercises`, `sets`, `setCount`, `duration`.
- Removed: `formatSetCount`, `formatDuration`, `routinePreview`.

Server pages in this task only switch the *formatter* calls. The rest of each page's English is translated in its own later task.

- [ ] **Step 1: Write the failing formatter tests** in `lib/sessions/summary.test.ts`

Replace the import block with:

```ts
import { describe, it, expect } from "vitest";
import {
  computeSessionSummary,
  topWorkingSet,
  workingSetNumbers,
  countSets,
  formatSessionDate,
  sessionDurationMinutes,
  splitDuration,
  formatShortDate,
  formatRelativeDate,
  formatMonthHeading,
  formatAxisDate,
  type ExerciseSummary,
} from "./summary";
```

Replace the `describe("formatSetCount", …)` block with:

```ts
describe("countSets", () => {
  const w = { is_warmup: true };
  const x = { is_warmup: false };

  it("counts working sets and warmups separately", () => {
    expect(countSets([x, x, x])).toEqual({ working: 3, warmups: 0 });
    expect(countSets([w, w, x, x])).toEqual({ working: 2, warmups: 2 });
    expect(countSets([w, w, w])).toEqual({ working: 0, warmups: 3 });
    expect(countSets([])).toEqual({ working: 0, warmups: 0 });
  });
});
```

Replace `describe("formatSessionDate", …)`, `describe("formatDuration", …)`, `describe("formatShortDate", …)`, `describe("formatRelativeDate", …)` and `describe("formatMonthHeading", …)` with the blocks below. Keep `describe("sessionDurationMinutes", …)` as is.

```ts
describe("formatSessionDate", () => {
  it("formats an ISO date without timezone shift", () => {
    expect(formatSessionDate("2026-08-11", "en")).toBe("Aug 11, 2026");
    expect(formatSessionDate("2026-01-01", "en")).toBe("Jan 1, 2026");
  });

  it("uses the Buddhist Era in Thai", () => {
    expect(formatSessionDate("2026-08-11", "th")).toBe("11 ส.ค. 2569");
    expect(formatSessionDate("2026-01-01", "th")).toBe("1 ม.ค. 2569");
  });

  it("returns the input unchanged when it isn't a parseable date", () => {
    expect(formatSessionDate("not-a-date", "en")).toBe("not-a-date");
  });
});

describe("splitDuration", () => {
  it("splits minutes into hours, minutes and zero-padded minutes", () => {
    expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45, mm: "45" });
    expect(splitDuration(75)).toEqual({ hours: 1, minutes: 15, mm: "15" });
    expect(splitDuration(120)).toEqual({ hours: 2, minutes: 0, mm: "00" });
    expect(splitDuration(125)).toEqual({ hours: 2, minutes: 5, mm: "05" });
  });
});

describe("formatShortDate", () => {
  it("formats a date-only string with its weekday", () => {
    expect(formatShortDate("2026-09-23", "en")).toBe("Wed, Sep 23");
    expect(formatShortDate("2026-09-23", "th")).toBe("พ. 23 ก.ย.");
  });

  it("returns unparseable input unchanged", () => {
    expect(formatShortDate("nope", "en")).toBe("nope");
  });
});

describe("formatRelativeDate", () => {
  const labels = { today: "Today", yesterday: "Yesterday" };

  it("uses the given labels for the two most recent days", () => {
    expect(formatRelativeDate("2026-09-26", "2026-09-26", "en", labels)).toBe("Today");
    expect(formatRelativeDate("2026-09-25", "2026-09-26", "en", labels)).toBe("Yesterday");
    expect(
      formatRelativeDate("2026-09-26", "2026-09-26", "th", { today: "วันนี้", yesterday: "เมื่อวาน" })
    ).toBe("วันนี้");
  });

  it("handles a month boundary for Yesterday", () => {
    expect(formatRelativeDate("2026-08-31", "2026-09-01", "en", labels)).toBe("Yesterday");
  });

  it("uses the short form within the year and the full form across years", () => {
    expect(formatRelativeDate("2026-09-20", "2026-09-26", "en", labels)).toBe("Sun, Sep 20");
    expect(formatRelativeDate("2025-12-30", "2026-01-02", "en", labels)).toBe("Dec 30, 2025");
    expect(formatRelativeDate("2025-12-30", "2026-01-02", "th", labels)).toBe("30 ธ.ค. 2568");
  });
});

describe("formatMonthHeading", () => {
  it("names the month and year", () => {
    expect(formatMonthHeading("2026-09-23", "en")).toBe("September 2026");
    expect(formatMonthHeading("2026-09-23", "th")).toBe("กันยายน 2569");
  });
});

describe("formatAxisDate", () => {
  it("is month/day in English and day/month in Thai", () => {
    expect(formatAxisDate("2026-09-23", "en")).toBe("9/23");
    expect(formatAxisDate("2026-09-23", "th")).toBe("23/9");
  });
});
```

If the old `formatMonthHeading` block had more `it`s than the one shown in this plan, keep them and add `"en"` as the second argument.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/sessions/summary.test.ts`
Expected: FAIL (`countSets` / `splitDuration` / `formatAxisDate` are not exported, and the Thai assertions fail).

- [ ] **Step 3: Implement in `lib/sessions/summary.ts`**

Replace `formatSetCount` with:

```ts
// Per-exercise counts, rendered by the `common.setCount` message ("2 sets + 2W" / "2 เซ็ต + 2W").
export function countSets(sets: { is_warmup: boolean }[]): { working: number; warmups: number } {
  const warmups = sets.filter((s) => s.is_warmup).length;
  return { working: sets.length - warmups, warmups };
}
```

Delete the `MONTHS` constant and the old `formatSessionDate`. In their place add:

```ts
// Formats calendar parts as a UTC date so no timezone can shift the day. `locale` "th" gives
// Buddhist Era years.
function formatUtcDate(dateStr: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  );
}

// "2026-08-11" -> "Aug 11, 2026" (en) / "11 ส.ค. 2569" (th).
export function formatSessionDate(dateStr: string, locale: string): string {
  return formatUtcDate(dateStr, locale, { month: "short", day: "numeric", year: "numeric" });
}
```

Replace `formatDuration` with:

```ts
// 75 -> { hours: 1, minutes: 15, mm: "15" }, rendered by the `common.duration` message
// ("45 min" / "1h 15m"; "45 นาที" / "1 ชม. 15 นาที").
export function splitDuration(minutes: number): { hours: number; minutes: number; mm: string } {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return { hours, minutes: rest, mm: String(rest).padStart(2, "0") };
}
```

Delete `WEEKDAYS` and `MONTH_NAMES`. Keep `parseDateParts` and `dayDiff`. Replace `formatShortDate`, `formatRelativeDate` and `formatMonthHeading` with:

```ts
// "2026-09-23" -> "Wed, Sep 23" (en) / "พ. 23 ก.ย." (th).
export function formatShortDate(dateStr: string, locale: string): string {
  return formatUtcDate(dateStr, locale, { weekday: "short", month: "short", day: "numeric" });
}

// Today / Yesterday (the caller's translated labels), the short form within the same year,
// else the full date. `today` is the viewer's local calendar date (getLocalDateString).
export function formatRelativeDate(
  dateStr: string,
  today: string,
  locale: string,
  labels: { today: string; yesterday: string }
): string {
  const diff = dayDiff(dateStr, today);
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.yesterday;
  const parts = parseDateParts(dateStr);
  const todayParts = parseDateParts(today);
  if (parts && todayParts && parts.year === todayParts.year) return formatShortDate(dateStr, locale);
  return formatSessionDate(dateStr, locale);
}

// "2026-09-23" -> "September 2026" / "กันยายน 2569", the month group heading in History.
export function formatMonthHeading(dateStr: string, locale: string): string {
  return formatUtcDate(dateStr, locale, { month: "long", year: "numeric" });
}

// "2026-09-23" -> "9/23" (en) / "23/9" (th) for compact chart axes.
export function formatAxisDate(dateStr: string, locale: string): string {
  return formatUtcDate(dateStr, locale, { month: "numeric", day: "numeric" });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/sessions/summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Routine preview, test first** (`lib/routines/preview.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { routinePreviewNames } from "./preview";

describe("routinePreviewNames", () => {
  it("is null for an empty routine", () => {
    expect(routinePreviewNames({ exerciseCount: 0, exerciseNames: [] })).toBeNull();
  });

  it("lists names and marks truncation", () => {
    expect(routinePreviewNames({ exerciseCount: 1, exerciseNames: ["Squat"] })).toBe("Squat");
    expect(routinePreviewNames({ exerciseCount: 5, exerciseNames: ["A", "B", "C"] })).toBe("A, B, C…");
  });
});
```

Run: `npx vitest run lib/routines/preview.test.ts`. Expected: FAIL (`routinePreviewNames` is not exported).

Replace the whole of `lib/routines/preview.ts` with:

```ts
// The names part of a routine row's preview, "Bench Press, Squat, Row…" (the count is rendered
// by the caller via the `common.exercises` message). null for an empty routine. Pure (no DB) so
// it runs under `npm test`; the names come from listRoutines' first-N preview.
export function routinePreviewNames(routine: {
  exerciseCount: number;
  exerciseNames: string[];
}): string | null {
  if (routine.exerciseCount === 0) return null;
  const more = routine.exerciseCount > routine.exerciseNames.length ? "…" : "";
  return `${routine.exerciseNames.join(", ")}${more}`;
}
```

Run: `npx vitest run lib/routines/preview.test.ts`. Expected: PASS.

- [ ] **Step 6: `sessionDisplayName` takes the fallback label** (`lib/sessions/history.ts`)

```ts
// The display label for a session: the name snapshotted at start, falling back to the linked
// routine's current name, then the caller's translated "Freeform Workout".
export function sessionDisplayName(
  session: { name: string | null; routineName?: string | null },
  freeformLabel: string
): string {
  return session.name ?? session.routineName ?? freeformLabel;
}
```

- [ ] **Step 7: Add the `common` namespace and its render test**

Add to `messages/en.json` (top level):

```json
  "common": {
    "today": "Today",
    "yesterday": "Yesterday",
    "freeformWorkout": "Freeform Workout",
    "noExercisesYet": "No exercises yet",
    "exercises": "{count, plural, one {# exercise} other {# exercises}}",
    "sets": "{count, plural, one {# set} other {# sets}}",
    "setCount": "{working, plural, one {# set} other {# sets}}{warmups, plural, =0 {} other { + #W}}",
    "duration": "{hours, plural, =0 {{minutes} min} other {{hours}h {mm}m}}"
  }
```

Add to `messages/th.json`:

```json
  "common": {
    "today": "วันนี้",
    "yesterday": "เมื่อวาน",
    "freeformWorkout": "ฝึกอิสระ",
    "noExercisesYet": "ยังไม่มีท่า",
    "exercises": "{count, plural, other {# ท่า}}",
    "sets": "{count, plural, other {# เซ็ต}}",
    "setCount": "{working, plural, other {# เซ็ต}}{warmups, plural, =0 {} other { + #W}}",
    "duration": "{hours, plural, =0 {{minutes} นาที} other {{hours} ชม. {mm} นาที}}"
  }
```

Append to `i18n/messages.test.ts` (add `import { createTranslator } from "next-intl";` to the imports):

```ts
describe("common messages render", () => {
  const tEn = createTranslator({ locale: "en", messages: en, namespace: "common" });
  const tTh = createTranslator({ locale: "th", messages: th as typeof en, namespace: "common" });

  it("renders set counts like the old formatSetCount", () => {
    expect(tEn("setCount", { working: 3, warmups: 0 })).toBe("3 sets");
    expect(tEn("setCount", { working: 1, warmups: 0 })).toBe("1 set");
    expect(tEn("setCount", { working: 2, warmups: 2 })).toBe("2 sets + 2W");
    expect(tEn("setCount", { working: 0, warmups: 3 })).toBe("0 sets + 3W");
    expect(tTh("setCount", { working: 2, warmups: 2 })).toBe("2 เซ็ต + 2W");
  });

  it("renders durations like the old formatDuration", () => {
    expect(tEn("duration", { hours: 0, minutes: 45, mm: "45" })).toBe("45 min");
    expect(tEn("duration", { hours: 1, minutes: 15, mm: "15" })).toBe("1h 15m");
    expect(tEn("duration", { hours: 2, minutes: 0, mm: "00" })).toBe("2h 00m");
    expect(tTh("duration", { hours: 1, minutes: 5, mm: "05" })).toBe("1 ชม. 05 นาที");
    expect(tTh("duration", { hours: 0, minutes: 45, mm: "45" })).toBe("45 นาที");
  });

  it("pluralizes counts", () => {
    expect(tEn("exercises", { count: 1 })).toBe("1 exercise");
    expect(tEn("sets", { count: 4 })).toBe("4 sets");
    expect(tTh("exercises", { count: 5 })).toBe("5 ท่า");
  });
});
```

Run: `npx vitest run i18n/messages.test.ts`. Expected: PASS.

- [ ] **Step 8: Create `app/(app)/routines/RoutinePreviewText.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { routinePreviewNames } from "@/lib/routines/preview";

// "5 exercises · Bench Press, Squat, Row…" or "No exercises yet". No directive: it renders as a
// server component on the routines index and as a client component inside StartSessionButtons.
export function RoutinePreviewText({
  routine,
}: {
  routine: { exerciseCount: number; exerciseNames: string[] };
}) {
  const t = useTranslations("common");
  const names = routinePreviewNames(routine);
  if (names === null) return <>{t("noExercisesYet")}</>;
  return (
    <>
      {t("exercises", { count: routine.exerciseCount })} · {names}
    </>
  );
}
```

- [ ] **Step 9: Update every caller**

Async server pages get `import { getLocale, getTranslations } from "next-intl/server";`. Client and sync components get `import { useLocale, useTranslations } from "next-intl";`.

**`app/(app)/dashboard/page.tsx`**
- `import { formatDuration, formatRelativeDate } from "@/lib/sessions/summary";` → `import { formatRelativeDate, splitDuration } from "@/lib/sessions/summary";`
- After `const today = getLocalDateString();` add:
  ```ts
    const [locale, tc] = await Promise.all([getLocale(), getTranslations("common")]);
    const relativeLabels = { today: tc("today"), yesterday: tc("yesterday") };
    const freeform = tc("freeformWorkout");
  ```
- Every `sessionDisplayName(x)` (3×) → `sessionDisplayName(x, freeform)`
- Every `formatRelativeDate(session.session_date, today)` (2×) → `formatRelativeDate(session.session_date, today, locale, relativeLabels)`
- `formatDuration(session.stats.durationMin)` → `tc("duration", splitDuration(session.stats.durationMin))`

**`app/(app)/history/page.tsx`**
- Summary import → `import { formatMonthHeading, formatRelativeDate, splitDuration } from "@/lib/sessions/summary";`
- `function groupByMonth(sessions: CompletedSessionListItem[])` → `function groupByMonth(sessions: CompletedSessionListItem[], locale: string)`, and inside it `formatMonthHeading(session.session_date, locale)`
- After `const today = getLocalDateString();` add the same three lines as dashboard (`locale`, `tc`, `relativeLabels`, `freeform`)
- `groupByMonth(sessions)` → `groupByMonth(sessions, locale)`
- `sessionDisplayName(session)` (2×) → `sessionDisplayName(session, freeform)`
- `formatRelativeDate(session.session_date, today)` → `formatRelativeDate(session.session_date, today, locale, relativeLabels)`
- `formatDuration(session.stats.durationMin)` → `tc("duration", splitDuration(session.stats.durationMin))`

**`app/(app)/history/[sessionId]/page.tsx`**
- In the summary import, `formatSetCount` → `countSets` and `formatDuration` → `splitDuration`
- Add `import { useLocale } from "next-intl";` and `import { getLocale, getTranslations } from "next-intl/server";`
- `VolumeComparison`: first line `const locale = useLocale();`, then `formatSessionDate(previous.sessionDate)` → `formatSessionDate(previous.sessionDate, locale)`
- After `const prByExercise = …;` add `const [locale, tc] = await Promise.all([getLocale(), getTranslations("common")]);`
- `sessionDisplayName(session)` → `sessionDisplayName(session, tc("freeformWorkout"))`
- `formatSessionDate(session.session_date)` → `formatSessionDate(session.session_date, locale)`
- `formatDuration(duration)` → `tc("duration", splitDuration(duration))`
- `formatSetCount(exercise.sets)` → `tc("setCount", countSets(exercise.sets))`

**`app/(app)/exercises/ExerciseList.tsx`** (client)
- At the top of `ExerciseList`: `const locale = useLocale(); const tc = useTranslations("common");`
- `formatRelativeDate(stat.lastDate, today)` → `formatRelativeDate(stat.lastDate, today, locale, { today: tc("today"), yesterday: tc("yesterday") })`

**`app/(app)/exercises/[exerciseId]/page.tsx`**
- After `const today = getLocalDateString();` add `const [locale, tc] = await Promise.all([getLocale(), getTranslations("common")]);` and `const relativeLabels = { today: tc("today"), yesterday: tc("yesterday") };`
- `formatRelativeDate(session.date, today)` → `formatRelativeDate(session.date, today, locale, relativeLabels)`

**`app/(app)/exercises/[exerciseId]/ProgressChartInner.tsx`** (client)
- Delete the local `axisDate` function. Import `formatAxisDate, formatShortDate` from `@/lib/sessions/summary`.
- First line of the component: `const locale = useLocale();`
- `tickFormatter={axisDate}` → `tickFormatter={(date: string) => formatAxisDate(date, locale)}`
- `labelFormatter={(label) => formatShortDate(String(label))}` → `labelFormatter={(label) => formatShortDate(String(label), locale)}`

**`app/(app)/dashboard/WeeklyVolumeChartInner.tsx`** (client)
- Delete `weekLabel`. Add `import { formatAxisDate } from "@/lib/sessions/summary";` and `import { useLocale } from "next-intl";`
- First line of the component: `const locale = useLocale();`
- `: weekLabel(d.weekStart),` → `: formatAxisDate(d.weekStart, locale),` ("This wk" is translated in Task 5)

**`app/(app)/routines/page.tsx`**
- `import { routinePreview } from "@/lib/routines/preview";` → `import { RoutinePreviewText } from "./RoutinePreviewText";`
- `{routinePreview(routine)}` → `<RoutinePreviewText routine={routine} />`

**`app/(app)/log/StartSessionButtons.tsx`**
- `import { routinePreview } from "@/lib/routines/preview";` → `import { RoutinePreviewText } from "../routines/RoutinePreviewText";`
- `{routinePreview(routine)}` → `<RoutinePreviewText routine={routine} />`

**`app/(app)/log/page.tsx`**
- Add `import { formatSessionDate } from "@/lib/sessions/summary";`
- After `const current = inProgress[0] ?? null;` add `const [locale, tc] = await Promise.all([getLocale(), getTranslations("common")]);`
- `{sessionDisplayName(current)} · {current.session_date}` → `{sessionDisplayName(current, tc("freeformWorkout"))} · {formatSessionDate(current.session_date, locale)}`

**`app/(app)/log/[sessionId]/page.tsx`**
- Before `const displayName`, add `const tc = await getTranslations("common");`
- `sessionDisplayName({ … })` → `sessionDisplayName({ … }, tc("freeformWorkout"))`

**`app/(app)/log/[sessionId]/LoggingClient.tsx`**
- `import { computeSessionSummary, formatDuration } from "@/lib/sessions/summary";` → `import { computeSessionSummary, splitDuration } from "@/lib/sessions/summary";`
- Add `import { useTranslations } from "next-intl";`. In `LoggingClient`, add `const tc = useTranslations("common");` next to the other hooks
- `formatDuration(elapsedMinutes)` → `tc("duration", splitDuration(elapsedMinutes))`

**`app/(app)/log/[sessionId]/ExerciseCard.tsx`**
- In the summary import, `formatSetCount` → `countSets`
- `LastTimeHint`: make `const locale = useLocale();` its **first** line, before the early `return null` (hooks can't follow an early return). Then `formatShortDate(last.sessionDate)` → `formatShortDate(last.sessionDate, locale)`
- `ExerciseCard`: add `const tc = useTranslations("common");` as the first line. Then `formatSetCount(exercise.sets)` → `tc("setCount", countSets(exercise.sets))`

- [ ] **Step 10: Confirm no stale callers**

Run: `grep -rn "formatSetCount\|formatDuration\|routinePreview(" app components lib`
Expected: no output.

- [ ] **Step 11: Gate and browser spot-check**

Run: `npx tsc --noEmit && npm run lint && npm test`. Expected: all pass.

In the browser (Thai):
- History month headings read "กันยายน 2569".
- Rows show "วันนี้" / "เมื่อวาน" or a Buddhist-Era date, and durations show "นาที".
- The weekly chart axis shows day/month.

Switch to English: the text matches the pre-change output exactly ("Today", "Aug 11, 2026", "1h 15m").

- [ ] **Step 12: Commit**

```bash
git add lib/sessions lib/routines lib/sessions/history.ts messages i18n "app/(app)"
git commit -m "feat(i18n): locale-aware date/duration/set-count formatters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: App shell, UI primitives, exercise picker, muscle labels, error strings

**Files:**
- Modify: `lib/validation.ts`, `lib/validation.test.ts`, `lib/exercises/picker.ts`, `lib/exercises/picker.test.ts`, `components/ui/muscle.ts`, `components/ui/ExercisePicker.tsx`, `components/ui/ConfirmDialog.tsx`, `components/ui/NumberField.tsx`, `components/ui/Toast.tsx`, `components/ui/Skeleton.tsx`, `app/(app)/nav-items.ts`, `app/(app)/TopBar.tsx`, `app/(app)/BottomNav.tsx`, `app/(app)/AccountMenu.tsx`, `app/(app)/LogoutButton.tsx`, `messages/en.json`, `messages/th.json`

**Interfaces:**
- Consumes: the `common` namespace (Task 2).
- Produces:
  - `isMuscleGroup(value: unknown): value is MuscleGroup` (`lib/validation.ts`)
  - `muscleLabel(t: (key: MuscleGroup) => string, group: string): string` (`components/ui/muscle.ts`)
  - `matchesQuery(option, query, muscleLabel?: (group: string) => string)`
  - `buildPickerSections({ …, muscleLabel? })`
  - `PickerSection` loses `label`
  - `NAV_ITEMS[i].labelKey: "dashboard" | "routines" | "exercises" | "history"`
  - Namespaces `nav`, `account`, `muscle`, `picker`, the full `errors` (used by Tasks 4–10), and more `common` keys.
  - `ConfirmDialog` `confirmLabel` / `cancelLabel` default to `common.confirm` / `common.cancel`.

- [ ] **Step 1: Failing tests**

`lib/validation.test.ts`: add `isMuscleGroup` to the import list, and append:

```ts
describe("isMuscleGroup", () => {
  it("accepts only the fixed muscle groups", () => {
    expect(isMuscleGroup("Chest")).toBe(true);
    expect(isMuscleGroup("Core")).toBe(true);
    expect(isMuscleGroup("chest")).toBe(false);
    expect(isMuscleGroup(null)).toBe(false);
  });
});
```

`lib/exercises/picker.test.ts`:
- `expect(sections[4]).toMatchObject({ label: "Other", muscleGroup: null });` → `expect(sections[4]).toMatchObject({ key: "group:Other", muscleGroup: null });`
- `expect(all[0]).toMatchObject({ key: "recent", label: "Recent" });` → `expect(all[0]).toMatchObject({ key: "recent", muscleGroup: null });`
- Append inside `describe("matchesQuery", …)`:

```ts
  it("also matches the translated muscle group name when a labeler is given", () => {
    const thai = (group: string) => ({ Legs: "ขา", Chest: "อก" })[group] ?? group;
    expect(matchesQuery(ex("x", "Squat", "Legs"), "ขา", thai)).toBe(true);
    expect(matchesQuery(ex("x", "Squat", "Legs"), "อก", thai)).toBe(false);
    expect(matchesQuery(ex("x", "Farmer Carry", null), "ขา", thai)).toBe(false);
  });
```

- Append inside `describe("buildPickerSections", …)`:

```ts
  it("passes the muscle labeler through to search", () => {
    const thai = (group: string) => ({ Legs: "ขา" })[group] ?? group;
    const sections = buildPickerSections({
      exercises: EXERCISES,
      query: "ขา",
      filter: "all",
      recentIds: [],
      muscleLabel: thai,
    });
    expect(ids(sections)).toEqual(["l1"]);
  });
```

Run: `npx vitest run lib/validation.test.ts lib/exercises/picker.test.ts`
Expected: FAIL (`isMuscleGroup` is not exported, and the "ขา" searches return nothing because the labeler is ignored).

- [ ] **Step 2: Implement**

`lib/validation.ts`, below `export type MuscleGroup …`:

```ts
export function isMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === "string" && (MUSCLE_GROUPS as readonly string[]).includes(value);
}
```

`lib/exercises/picker.ts`:
- In `PickerSection`, delete the `label: string;` line.
- Replace `matchesQuery` with:

```ts
// Every whitespace-separated token must appear in the name or muscle group, so "inc bench"
// finds "Incline Bench Press". With `muscleLabel`, the translated group name ("ขา") matches
// too. Case-insensitive; a blank query matches everything.
export function matchesQuery(
  option: ExerciseOption,
  query: string,
  muscleLabel?: (group: string) => string
): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const group = option.muscleGroup ?? "";
  const translated = group && muscleLabel ? muscleLabel(group) : "";
  const haystack = `${option.name} ${group} ${translated}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}
```

- In `buildPickerSections`:
  - Add `muscleLabel,` to the destructured parameters and `muscleLabel?: (group: string) => string;` to its type.
  - Change both `matchesQuery(e, query)` / `matchesQuery(exercise, query)` calls to pass `muscleLabel` as the third argument.
  - Change the pushes to `sections.push({ key: \`group:${group}\`, muscleGroup: group, items });` and `sections.push({ key: "group:Other", muscleGroup: null, items: other });`
  - Change `recentSection` to `return { key: "recent", muscleGroup: null, items };`

`components/ui/muscle.ts`: add `import { isMuscleGroup, type MuscleGroup } from "@/lib/validation";` and append:

```ts
// Display name for a stored muscle group (stored values stay English). Pass
// useTranslations("muscle") / await getTranslations("muscle"). Unknown values show as stored.
export function muscleLabel(t: (key: MuscleGroup) => string, group: string): string {
  return isMuscleGroup(group) ? t(group) : group;
}
```

If `tsc` rejects passing a next-intl translator as `(key: MuscleGroup) => string`, call it as `muscleLabel((key) => tm(key), group)` everywhere in this plan.

Run: `npx vitest run lib/validation.test.ts lib/exercises/picker.test.ts`. Expected: PASS.

- [ ] **Step 3: Messages.** Add these top-level namespaces and extend `common` in **en.json**:

```json
  "nav": {
    "dashboard": "Dashboard",
    "routines": "Routines",
    "exercises": "Exercises",
    "history": "History",
    "landingPage": "Weight Training Tracker landing page",
    "resumeWorkout": "Resume workout",
    "logWorkout": "Log workout",
    "logAWorkout": "Log a workout",
    "resume": "Resume",
    "log": "Log"
  },
  "account": {
    "menu": "Account menu",
    "profile": "Profile",
    "settings": "Settings",
    "theme": "Theme",
    "logOut": "Log out",
    "logOutTitle": "Log out?",
    "logOutDescription": "You'll need to sign in with Google again to get back in."
  },
  "muscle": {
    "Chest": "Chest",
    "Back": "Back",
    "Legs": "Legs",
    "Shoulders": "Shoulders",
    "Arms": "Arms",
    "Core": "Core"
  },
  "picker": {
    "addExercise": "Add exercise",
    "addedCount": "{count} added",
    "searchLabel": "Search exercises",
    "searchPlaceholder": "Search exercises…",
    "clearSearch": "Clear search",
    "filterLabel": "Filter by muscle group",
    "recent": "Recent",
    "other": "Other",
    "listLabel": "Exercises",
    "added": "Added",
    "noMatch": "No exercises match “{query}”.",
    "noMatchIn": "No exercises match “{query}” in {group}.",
    "noRecent": "No recent exercises yet.",
    "noExercises": "No exercises yet.",
    "searchAllGroups": "Search all groups",
    "createPrompt": "Create <b>“{name}”</b> — which muscle group?",
    "muscleGroupLabel": "Muscle group",
    "createAndAdd": "Create & add",
    "create": "Create “{name}”"
  },
  "errors": {
    "addExercise": "Failed to add exercise",
    "createExercise": "Failed to create exercise",
    "archiveExercise": "Failed to archive exercise",
    "createRoutine": "Failed to create routine",
    "deleteRoutine": "Failed to delete routine",
    "moveExercise": "Failed to move exercise",
    "removeExercise": "Failed to remove exercise",
    "updateTargetSets": "Failed to update target sets",
    "startWorkout": "Failed to start workout",
    "finishWorkout": "Failed to finish workout",
    "discardWorkout": "Failed to discard workout",
    "deleteWorkout": "Failed to delete workout",
    "saveSet": "Failed to save that set",
    "saveSetOffline": "Failed to save that set — check your connection and try again.",
    "deleteSet": "Failed to delete set",
    "exportBackup": "Could not export your data",
    "invalidJson": "That file isn't valid JSON.",
    "copyLink": "Couldn't copy — copy the link manually",
    "signIn": "Sign-in failed. Please try again.",
    "backup": {
      "invalidFile": "This file isn't a workout-tracker backup",
      "unsupportedVersion": "Unsupported backup version",
      "importFailed": "Could not import backup"
    },
    "referral": {
      "notAuthenticated": "You're signed out — sign in again",
      "regenerateFailed": "Could not regenerate code"
    }
  }
```

Extend `common` (en):

```json
    "appName": "Weight Training Tracker",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "delete": "Delete",
    "remove": "Remove",
    "save": "Save",
    "done": "Done",
    "loading": "Loading",
    "dismiss": "Dismiss",
    "goBack": "Go back",
    "all": "All",
    "decrease": "Decrease {label}",
    "increase": "Increase {label}",
    "setColumn": "Set",
    "weightColumn": "Weight",
    "repsColumn": "Reps"
```

**th.json**, the same keys:

```json
  "nav": {
    "dashboard": "หน้าหลัก",
    "routines": "โปรแกรม",
    "exercises": "ท่าฝึก",
    "history": "ประวัติ",
    "landingPage": "หน้าแรกของ Weight Training Tracker",
    "resumeWorkout": "ฝึกต่อ",
    "logWorkout": "บันทึกการฝึก",
    "logAWorkout": "บันทึกการฝึก",
    "resume": "ฝึกต่อ",
    "log": "บันทึก"
  },
  "account": {
    "menu": "เมนูบัญชี",
    "profile": "โปรไฟล์",
    "settings": "ตั้งค่า",
    "theme": "ธีม",
    "logOut": "ออกจากระบบ",
    "logOutTitle": "ออกจากระบบ?",
    "logOutDescription": "คุณจะต้องเข้าสู่ระบบด้วย Google อีกครั้งเพื่อกลับเข้ามา"
  },
  "muscle": {
    "Chest": "อก",
    "Back": "หลัง",
    "Legs": "ขา",
    "Shoulders": "ไหล่",
    "Arms": "แขน",
    "Core": "แกนกลางลำตัว"
  },
  "picker": {
    "addExercise": "เพิ่มท่า",
    "addedCount": "เพิ่มแล้ว {count}",
    "searchLabel": "ค้นหาท่า",
    "searchPlaceholder": "ค้นหาท่า…",
    "clearSearch": "ล้างคำค้นหา",
    "filterLabel": "กรองตามกลุ่มกล้ามเนื้อ",
    "recent": "ล่าสุด",
    "other": "อื่นๆ",
    "listLabel": "ท่าออกกำลังกาย",
    "added": "เพิ่มแล้ว",
    "noMatch": "ไม่พบท่าที่ตรงกับ “{query}”",
    "noMatchIn": "ไม่พบท่าที่ตรงกับ “{query}” ในหมวด {group}",
    "noRecent": "ยังไม่มีท่าที่ฝึกล่าสุด",
    "noExercises": "ยังไม่มีท่า",
    "searchAllGroups": "ค้นหาทุกกลุ่ม",
    "createPrompt": "สร้าง <b>“{name}”</b> — กลุ่มกล้ามเนื้อไหน?",
    "muscleGroupLabel": "กลุ่มกล้ามเนื้อ",
    "createAndAdd": "สร้างและเพิ่ม",
    "create": "สร้าง “{name}”"
  },
  "errors": {
    "addExercise": "เพิ่มท่าไม่สำเร็จ",
    "createExercise": "สร้างท่าไม่สำเร็จ",
    "archiveExercise": "เก็บท่าเข้าคลังไม่สำเร็จ",
    "createRoutine": "สร้างโปรแกรมไม่สำเร็จ",
    "deleteRoutine": "ลบโปรแกรมไม่สำเร็จ",
    "moveExercise": "เลื่อนท่าไม่สำเร็จ",
    "removeExercise": "เอาท่าออกไม่สำเร็จ",
    "updateTargetSets": "อัปเดตเซ็ตเป้าหมายไม่สำเร็จ",
    "startWorkout": "เริ่มการฝึกไม่สำเร็จ",
    "finishWorkout": "จบการฝึกไม่สำเร็จ",
    "discardWorkout": "ยกเลิกการฝึกไม่สำเร็จ",
    "deleteWorkout": "ลบการฝึกไม่สำเร็จ",
    "saveSet": "บันทึกเซ็ตไม่สำเร็จ",
    "saveSetOffline": "บันทึกเซ็ตไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง",
    "deleteSet": "ลบเซ็ตไม่สำเร็จ",
    "exportBackup": "ส่งออกข้อมูลไม่สำเร็จ",
    "invalidJson": "ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง",
    "copyLink": "คัดลอกไม่สำเร็จ — โปรดคัดลอกลิงก์เอง",
    "signIn": "เข้าสู่ระบบไม่สำเร็จ โปรดลองอีกครั้ง",
    "backup": {
      "invalidFile": "ไฟล์นี้ไม่ใช่ไฟล์สำรองของ workout-tracker",
      "unsupportedVersion": "ไม่รองรับไฟล์สำรองเวอร์ชันนี้",
      "importFailed": "นำเข้าข้อมูลสำรองไม่สำเร็จ"
    },
    "referral": {
      "notAuthenticated": "คุณออกจากระบบแล้ว — โปรดเข้าสู่ระบบอีกครั้ง",
      "regenerateFailed": "สร้างลิงก์ใหม่ไม่สำเร็จ"
    }
  }
```

Extend `common` (th):

```json
    "appName": "Weight Training Tracker",
    "cancel": "ยกเลิก",
    "confirm": "ยืนยัน",
    "delete": "ลบ",
    "remove": "เอาออก",
    "save": "บันทึก",
    "done": "เสร็จ",
    "loading": "กำลังโหลด",
    "dismiss": "ปิด",
    "goBack": "ย้อนกลับ",
    "all": "ทั้งหมด",
    "decrease": "ลดค่า {label}",
    "increase": "เพิ่มค่า {label}",
    "setColumn": "เซ็ต",
    "weightColumn": "น้ำหนัก",
    "repsColumn": "ครั้ง"
```

`nav.exercises` is "ท่าฝึก" on purpose: a bottom-nav slot is about 75px wide at 375px, and "ท่าออกกำลังกาย" wraps there. Page titles still use ท่าออกกำลังกาย.

Run: `npx vitest run i18n/messages.test.ts`. Expected: PASS.

- [ ] **Step 4: Primitives**

`components/ui/ConfirmDialog.tsx`:
- Add `import { useTranslations } from "next-intl";`
- Remove the defaults `confirmLabel = "Confirm",` / `cancelLabel = "Cancel",`, leaving `confirmLabel,` / `cancelLabel,`. The props type already has them optional; if not, mark both `?: string`.
- Add `const t = useTranslations("common");` as the first line of the component, before any early return.
- Render `{confirmLabel ?? t("confirm")}` and `{cancelLabel ?? t("cancel")}`.

`components/ui/NumberField.tsx`: add `import { useTranslations } from "next-intl";` and `const t = useTranslations("common");` as the component's first line. Then:
- `` aria-label={`Decrease ${label}`} `` → `aria-label={t("decrease", { label })}`
- `` aria-label={`Increase ${label}`} `` → `aria-label={t("increase", { label })}`

`components/ui/Toast.tsx`: add the import and `const t = useTranslations("common");` as the **first** line of the component (before `if (message === null) return null;`). Then `aria-label="Dismiss"` → `aria-label={t("dismiss")}`.

`components/ui/Skeleton.tsx` (`PageSkeleton` is a sync component, so the hook works on the server): add `import { useTranslations } from "next-intl";`, `const t = useTranslations("common");` in `PageSkeleton`, and `aria-label="Loading"` → `aria-label={t("loading")}`.

- [ ] **Step 5: `components/ui/ExercisePicker.tsx`**

- Imports: add `useCallback` to the React import, `import { useTranslations } from "next-intl";`, and change `import { muscleStyle, muscleTone } from "./muscle";` → `import { muscleLabel, muscleStyle, muscleTone } from "./muscle";`.
- Props: `triggerLabel = "Add exercise",` → `triggerLabel,`.
- First lines of the component body:

```tsx
  const t = useTranslations("picker");
  const tc = useTranslations("common");
  const tm = useTranslations("muscle");
  const te = useTranslations("errors");
  const groupLabel = useCallback((group: string) => muscleLabel(tm, group), [tm]);
  const title = triggerLabel ?? t("addExercise");
```

- `sections` memo: `buildPickerSections({ exercises: allExercises, query, filter, recentIds, muscleLabel: groupLabel })` with deps `[allExercises, query, filter, recentIds, groupLabel]`.
- Below the `sections` memo, add:

```tsx
  function sectionLabel(section: PickerSection): string {
    if (section.key === "recent") return t("recent");
    return section.muscleGroup ? groupLabel(section.muscleGroup) : t("other");
  }
```

- `add()` catch → `console.error(err); setError(te("addExercise"));`. `createAndAdd()` catch → `console.error(err); setError(te("createExercise"));`.
- Replace in JSX:

| Old | New |
|---|---|
| `{triggerLabel}` (button and `<h2>`) | `{title}` |
| `{addedThisOpen.length} added` | `{t("addedCount", { count: addedThisOpen.length })}` |
| `Done` | `{tc("done")}` |
| `aria-label="Search exercises"` | `aria-label={t("searchLabel")}` |
| `placeholder="Search exercises…"` | `placeholder={t("searchPlaceholder")}` |
| `aria-label="Clear search"` | `aria-label={t("clearSearch")}` |
| `aria-label="Filter by muscle group"` | `aria-label={t("filterLabel")}` |
| `<FilterChip label="All"` | `<FilterChip label={tc("all")}` |
| `label="Recent"` | `label={t("recent")}` |
| `label={group}` (both FilterChip lists) | `label={groupLabel(group)}` |
| `aria-label="Exercises"` | `aria-label={t("listLabel")}` |
| `<SectionHeader id={…} section={section} />` | `<SectionHeader id={…} section={section} label={sectionLabel(section)} />` |
| `<Badge tone={muscleTone(exercise.muscleGroup)}>{exercise.muscleGroup}</Badge>` | `<Badge tone={muscleTone(exercise.muscleGroup)}>{groupLabel(exercise.muscleGroup)}</Badge>` |
| `Added` (badge) | `{t("added")}` |
| `Search all groups` | `{t("searchAllGroups")}` |
| `aria-label="Muscle group"` | `aria-label={t("muscleGroupLabel")}` |
| `Cancel` | `{tc("cancel")}` |
| `Create &amp; add` | `{t("createAndAdd")}` |
| `Create “{trimmedQuery}”` (span) | `{t("create", { name: trimmedQuery })}` |

- Empty-state paragraph body becomes:

```tsx
                {trimmedQuery
                  ? filter === "all"
                    ? t("noMatch", { query: trimmedQuery })
                    : t("noMatchIn", {
                        query: trimmedQuery,
                        group: filter === "recent" ? t("recent") : groupLabel(filter),
                      })
                  : filter === "recent"
                    ? t("noRecent")
                    : t("noExercises")}
```

- The create prompt `<p>` body becomes:

```tsx
                    {t.rich("createPrompt", {
                      name: trimmedQuery,
                      b: (chunks) => <span className="font-semibold">{chunks}</span>,
                    })}
```

- `SectionHeader`: the signature becomes `({ id, section, label }: { id: string; section: PickerSection; label: string })`, and `{section.label}` → `{label}`.

- [ ] **Step 6: Shell**

`app/(app)/nav-items.ts`:

```ts
import { House, ClipboardText, Barbell, ClockCounterClockwise } from "@phosphor-icons/react/ssr";

// labelKey is a key in the `nav` message namespace.
export const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "dashboard", icon: House },
  { href: "/routines", labelKey: "routines", icon: ClipboardText },
  { href: "/exercises", labelKey: "exercises", icon: Barbell },
  { href: "/history", labelKey: "history", icon: ClockCounterClockwise },
] as const;
```

`app/(app)/TopBar.tsx`: add `import { useTranslations } from "next-intl";`, then `const t = useTranslations("nav"); const tc = useTranslations("common");` in the component.
- `aria-label="Go back"` → `aria-label={tc("goBack")}`
- `aria-label="Weight Training Tracker landing page"` → `aria-label={t("landingPage")}`
- `<span className="hidden text-sm sm:inline">Weight Training Tracker</span>` → `…>{tc("appName")}</span>`
- `NAV_ITEMS.map(({ href, label, icon: Icon })` → `NAV_ITEMS.map(({ href, labelKey, icon: Icon })` and `{label}` → `{t(labelKey)}`
- `{resumeSessionId ? "Resume workout" : "Log workout"}` → `{resumeSessionId ? t("resumeWorkout") : t("logWorkout")}`

`app/(app)/BottomNav.tsx`: add `import { useTranslations } from "next-intl";` and `const t = useTranslations("nav");` in `BottomNav`.
- `<NavLink key={item.href} {...item} active={isActive(item.href)} />` (2×) → `<NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.labelKey)} active={isActive(item.href)} />`
- `aria-label={resuming ? "Resume workout" : "Log a workout"}` → `aria-label={resuming ? t("resumeWorkout") : t("logAWorkout")}`
- `{resuming ? "Resume" : "Log"}` → `{resuming ? t("resume") : t("log")}`

`app/(app)/AccountMenu.tsx`: add the import and `const t = useTranslations("account");`. Replace `aria-label="Account menu"`, `Profile`, `Settings`, `Theme`, `Log out` (menu item), `title="Log out?"`, `description="You'll need…"` and `confirmLabel="Log out"` with `t("menu")`, `t("profile")`, `t("settings")`, `t("theme")`, `t("logOut")`, `t("logOutTitle")`, `t("logOutDescription")` and `t("logOut")`.

`app/(app)/LogoutButton.tsx`: the same `account` keys. Replace the `Log out` button text, `aria-label="Log out"`, `title`, `description` and `confirmLabel`.

- [ ] **Step 7: Gate and browser check**

Run: `npx tsc --noEmit && npm run lint && npm test`. Expected: all pass.

Browser (Thai, 375px via `resize_window` preset `mobile`):
- The bottom nav reads หน้าหลัก / โปรแกรม / บันทึก / ท่าฝึก / ประวัติ with no wrapping.
- The account menu items and the logout dialog are Thai.
- Open a routine, tap "เพิ่มท่า": section headers show อก/หลัง/…, and searching "ขา" finds Squat.

Switch to English and confirm the same screens read exactly as before. Reset `resize_window` to `desktop`.

- [ ] **Step 8: Commit**

```bash
git add lib/validation.ts lib/validation.test.ts lib/exercises components/ui "app/(app)/nav-items.ts" "app/(app)/TopBar.tsx" "app/(app)/BottomNav.tsx" "app/(app)/AccountMenu.tsx" "app/(app)/LogoutButton.tsx" messages
git commit -m "feat(i18n): translate app shell, UI primitives and exercise picker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Landing page and login (+ compact language toggle)

**Files:**
- Modify: `components/landing/LandingNav.tsx`, `components/landing/LandingPage.tsx`, `app/login/page.tsx`, `messages/en.json`, `messages/th.json`

**Interfaces:**
- Consumes: `LanguageToggleButton` (Task 1); `common.appName`, `errors.signIn` (Task 3).
- Produces: namespaces `landing`, `login`.

- [ ] **Step 1: Messages.** en.json:

```json
  "landing": {
    "goToApp": "Go to app",
    "logIn": "Log in",
    "goToDashboard": "Go to dashboard",
    "badge": "Progressive overload, tracked",
    "headline": "Lift more than last time.",
    "subhead": "A no-nonsense weight-training log. Record every set, watch your PRs climb, and never lose track of what to beat.",
    "previewThisWeek": "This week",
    "previewWorkouts": "Workouts",
    "previewVolume": "Volume",
    "previewNewPrs": "New PRs",
    "fastLoggingTitle": "Fast set logging",
    "fastLoggingBody": "Log weight and reps with +/- steppers. No fiddly typing mid-set.",
    "overloadTitle": "Progressive overload",
    "overloadBody": "See last session's numbers inline, so you always know what to beat.",
    "prsTitle": "Automatic PRs",
    "prsBody": "Your best working set per exercise, tracked live. Warmups excluded.",
    "chartsTitle": "Progress charts",
    "chartsBody": "Weekly training volume and per-exercise trends at a glance.",
    "howItWorks": "How it works",
    "step1Title": "Pick a routine",
    "step1Body": "Start from a saved routine or go freeform.",
    "step2Title": "Log your sets",
    "step2Body": "Tap through weight and reps as you lift.",
    "step3Title": "Watch progress",
    "step3Body": "PRs and volume update the moment you finish.",
    "ctaTitle": "Ready to log your next session?",
    "ctaBody": "Pick up where you left off and keep the streak going.",
    "footer": "All weights in kg · © {year}"
  },
  "login": {
    "title": "Log in",
    "subtitle": "Continue with your Google account.",
    "continueWithGoogle": "Continue with Google"
  }
```

th.json:

```json
  "landing": {
    "goToApp": "เข้าแอป",
    "logIn": "เข้าสู่ระบบ",
    "goToDashboard": "ไปหน้าหลัก",
    "badge": "ติดตาม progressive overload ให้อัตโนมัติ",
    "headline": "ยกให้ได้มากกว่าครั้งที่แล้ว",
    "subhead": "สมุดบันทึกเวทเทรนนิ่งที่ตรงไปตรงมา บันทึกทุกเซ็ต ดู PR ของคุณไต่ขึ้นเรื่อยๆ และรู้เสมอว่าต้องทำให้ได้เท่าไร",
    "previewThisWeek": "สัปดาห์นี้",
    "previewWorkouts": "การฝึก",
    "previewVolume": "ปริมาณรวม",
    "previewNewPrs": "PR ใหม่",
    "fastLoggingTitle": "บันทึกเซ็ตได้รวดเร็ว",
    "fastLoggingBody": "บันทึกน้ำหนักและจำนวนครั้งด้วยปุ่ม +/- ไม่ต้องพิมพ์ให้วุ่นระหว่างเซ็ต",
    "overloadTitle": "Progressive overload",
    "overloadBody": "เห็นตัวเลขจากการฝึกครั้งก่อนทันที จะได้รู้เสมอว่าต้องทำให้เกินเท่าไร",
    "prsTitle": "PR อัตโนมัติ",
    "prsBody": "เซ็ตที่ดีที่สุดของแต่ละท่า อัปเดตทันที ไม่นับเซ็ตวอร์มอัพ",
    "chartsTitle": "กราฟความก้าวหน้า",
    "chartsBody": "ดูปริมาณรวมรายสัปดาห์และแนวโน้มของแต่ละท่าได้ในพริบตา",
    "howItWorks": "ใช้งานอย่างไร",
    "step1Title": "เลือกโปรแกรม",
    "step1Body": "เริ่มจากโปรแกรมที่บันทึกไว้ หรือฝึกอิสระ",
    "step2Title": "บันทึกเซ็ต",
    "step2Body": "แตะใส่น้ำหนักและจำนวนครั้งระหว่างยก",
    "step3Title": "ดูความก้าวหน้า",
    "step3Body": "PR และปริมาณรวมอัปเดตทันทีที่ฝึกเสร็จ",
    "ctaTitle": "พร้อมบันทึกการฝึกครั้งต่อไปหรือยัง?",
    "ctaBody": "ฝึกต่อจากที่ค้างไว้ แล้วรักษาความต่อเนื่องไว้",
    "footer": "น้ำหนักทั้งหมดเป็น kg · © {year}"
  },
  "login": {
    "title": "เข้าสู่ระบบ",
    "subtitle": "ดำเนินการต่อด้วยบัญชี Google ของคุณ",
    "continueWithGoogle": "ดำเนินการต่อด้วย Google"
  }
```

- [ ] **Step 2: `components/landing/LandingNav.tsx`** (sync server component)

Add `import { useTranslations } from "next-intl";` and `import { LanguageToggleButton } from "@/components/theme/LanguageToggleButton";`. Add `const t = useTranslations("landing"); const tc = useTranslations("common");` in the component.
- `<span className="hidden sm:inline">Weight Training Tracker</span>` → `…>{tc("appName")}</span>`
- Insert `<LanguageToggleButton />` before `<ThemeToggleButton />`
- `Go to app` → `{t("goToApp")}`; `Log in` → `{t("logIn")}`

- [ ] **Step 3: `components/landing/LandingPage.tsx`** (sync server component)

Replace `FEATURES` and `STEPS` with key-based arrays:

```tsx
const FEATURES = [
  { key: "fastLogging", icon: <Lightning className="h-5 w-5" weight="bold" /> },
  { key: "overload", icon: <TrendUp className="h-5 w-5" weight="bold" /> },
  { key: "prs", icon: <Trophy className="h-5 w-5" weight="bold" /> },
  { key: "charts", icon: <ChartLine className="h-5 w-5" weight="bold" /> },
] as const;

const STEPS = ["1", "2", "3"] as const;
```

In `LandingPage`:

```tsx
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const primaryCta = authed
    ? { href: "/dashboard", label: t("goToDashboard") }
    : { href: "/login", label: t("logIn") };
```

Replace text:

| Old | New |
|---|---|
| `Progressive overload, tracked` | `{t("badge")}` |
| `Lift more than last time.` | `{t("headline")}` |
| the two-line subhead text | `{t("subhead")}` |
| `This week` | `{t("previewThisWeek")}` |
| `label="Workouts"` / `label="Volume"` / `label="New PRs"` | `label={t("previewWorkouts")}` / `label={t("previewVolume")}` / `label={t("previewNewPrs")}` |
| `How it works` | `{t("howItWorks")}` |
| `Ready to log your next session?` | `{t("ctaTitle")}` |
| `Pick up where you left off and keep the streak going.` | `{t("ctaBody")}` |
| footer `Weight Training Tracker` | `{tc("appName")}` |
| `All weights in kg &middot; &copy; {new Date().getFullYear()}` | `{t("footer", { year: String(new Date().getFullYear()) })}` |

Feature cards: `<Card key={f.key} …>`, `<h3 …>{t(\`${f.key}Title\`)}</h3>`, `<p …>{t(\`${f.key}Body\`)}</p>`.
Steps: `{STEPS.map((n) => (<Card key={n} …><span …>{n}</span><h3 …>{t(\`step${n}Title\`)}</h3><p …>{t(\`step${n}Body\`)}</p></Card>))}`.
If `tsc` can't narrow the template keys, append `as const` inside the call: `` t(`${f.key}Title` as const) ``.

- [ ] **Step 4: `app/login/page.tsx`** (client)

Add `import { useTranslations } from "next-intl";` and `import { LanguageToggleButton } from "@/components/theme/LanguageToggleButton";`.

`LoginCard`:

```tsx
  const t = useTranslations("login");
  const te = useTranslations("errors");
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? te("signIn") : null
  );
```

`Log in` → `{t("title")}`; `Continue with your Google account.` → `{t("subtitle")}`; `Continue with Google` → `{t("continueWithGoogle")}`.

`LoginPage`: add `const tc = useTranslations("common");`. The `<main>` className gains `relative`. Insert `<div className="absolute right-4 top-4"><LanguageToggleButton /></div>` as its first child, and replace `Weight Training Tracker` with `{tc("appName")}`.

- [ ] **Step 5: Gate and browser check**

`npx tsc --noEmit && npm run lint && npm test`. Expected: pass.

Log out (or use a private tab without the cookie):
- `/` is Thai, and the TH/EN toggle (showing "EN") switches the page to English and back.
- `/login` likewise.
- Check 375px width for overflow in the hero and the CTA buttons.

- [ ] **Step 6: Commit**

```bash
git add components/landing app/login/page.tsx messages
git commit -m "feat(i18n): translate landing and login, add language toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Dashboard

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`, `app/(app)/dashboard/DiscardSessionButton.tsx`, `app/(app)/dashboard/WeeklyVolumeChartInner.tsx`, `messages/en.json`, `messages/th.json`

**Interfaces:**
- Consumes: `tc` / `locale` / `relativeLabels` / `freeform` already in `dashboard/page.tsx` (Task 2); `errors.discardWorkout` (Task 3).
- Produces: namespace `dashboard`.

- [ ] **Step 1: Messages.** en.json:

```json
  "dashboard": {
    "title": "Dashboard",
    "resume": "Resume {name}",
    "start": "Start a Workout",
    "inProgress": "In Progress",
    "started": "Started {when}",
    "overview": "Overview",
    "streak": "Streak",
    "days": "{count, plural, one {day} other {days}}",
    "thisWeek": "This week",
    "sessions": "{count, plural, one {session} other {sessions}}",
    "volume": "Volume",
    "weeklyVolume": "Weekly volume",
    "personalRecords": "Personal records",
    "newBadge": "NEW",
    "recentWorkouts": "Recent workouts",
    "seeAll": "See all",
    "discardLabel": "Discard session",
    "discardTitle": "Discard this workout?",
    "discardDescription": "This in-progress workout and any sets logged in it will be permanently deleted.",
    "discard": "Discard",
    "chartThisWeek": "This wk",
    "chartVolumeSeries": "Volume (kg)"
  }
```

th.json:

```json
  "dashboard": {
    "title": "หน้าหลัก",
    "resume": "ฝึกต่อ: {name}",
    "start": "เริ่มฝึก",
    "inProgress": "กำลังฝึกอยู่",
    "started": "เริ่ม {when}",
    "overview": "ภาพรวม",
    "streak": "ฝึกต่อเนื่อง",
    "days": "{count, plural, other {วัน}}",
    "thisWeek": "สัปดาห์นี้",
    "sessions": "{count, plural, other {ครั้ง}}",
    "volume": "ปริมาณรวม",
    "weeklyVolume": "ปริมาณรวมรายสัปดาห์",
    "personalRecords": "สถิติส่วนตัว",
    "newBadge": "ใหม่",
    "recentWorkouts": "การฝึกล่าสุด",
    "seeAll": "ดูทั้งหมด",
    "discardLabel": "ยกเลิกการฝึก",
    "discardTitle": "ยกเลิกการฝึกนี้?",
    "discardDescription": "การฝึกที่ค้างอยู่นี้และทุกเซ็ตที่บันทึกไว้จะถูกลบถาวร",
    "discard": "ยกเลิกการฝึก",
    "chartThisWeek": "สัปดาห์นี้",
    "chartVolumeSeries": "ปริมาณรวม (kg)"
  }
```

- [ ] **Step 2: `app/(app)/dashboard/page.tsx`**

- Import `getFormatter` alongside `getLocale, getTranslations`.
- Change the Task 2 line to `const [locale, tc, t, format] = await Promise.all([getLocale(), getTranslations("common"), getTranslations("dashboard"), getFormatter()]);`

| Old | New |
|---|---|
| `>Dashboard<` | `>{t("title")}<` |
| `` current ? `Resume ${sessionDisplayName(current, freeform)}` : "Start a Workout" `` | `current ? t("resume", { name: sessionDisplayName(current, freeform) }) : t("start")` |
| `In Progress` | `{t("inProgress")}` |
| `Started {formatRelativeDate(…).toLowerCase()}` | `{t("started", { when: formatRelativeDate(session.session_date, today, locale, relativeLabels).toLowerCase() })}` |
| `Overview` | `{t("overview")}` |
| `label="Streak"` / `unit={overview.streakDays === 1 ? "day" : "days"}` | `label={t("streak")}` / `unit={t("days", { count: overview.streakDays })}` |
| `label="This week"` / `unit={… "session" : "sessions"}` | `label={t("thisWeek")}` / `unit={t("sessions", { count: overview.sessionsThisWeek })}` |
| `label="Volume"` / `value={Math.round(overview.volumeThisWeekKg).toLocaleString()}` | `label={t("volume")}` / `value={format.number(Math.round(overview.volumeThisWeekKg))}` |
| `Weekly volume` | `{t("weeklyVolume")}` |
| `Personal records` | `{t("personalRecords")}` |
| `<Badge tone="success">NEW</Badge>` | `<Badge tone="success">{t("newBadge")}</Badge>` |
| `Recent workouts` | `{t("recentWorkouts")}` |
| `See all` | `{t("seeAll")}` |

The recent-workout detail line becomes:

```tsx
                    <span className="block truncate text-sm text-muted">
                      {formatRelativeDate(session.session_date, today, locale, relativeLabels)} ·{" "}
                      {tc("sets", { count: session.stats.setCount })} ·{" "}
                      {format.number(session.stats.volumeKg)} kg
                      {session.stats.durationMin !== null &&
                        ` · ${tc("duration", splitDuration(session.stats.durationMin))}`}
                    </span>
```

- [ ] **Step 3: `DiscardSessionButton.tsx`**

Add `const t = useTranslations("dashboard"); const te = useTranslations("errors");`. The catch becomes `console.error(err); setError(te("discardWorkout"));`. Then: `aria-label={t("discardLabel")}`, `title={t("discardTitle")}`, `description={t("discardDescription")}`, `confirmLabel={t("discard")}`.

- [ ] **Step 4: `WeeklyVolumeChartInner.tsx`**

Add `useTranslations, useFormatter` to the `next-intl` import. In the component: `const t = useTranslations("dashboard"); const format = useFormatter();`.
- `"This wk"` → `t("chartThisWeek")`
- `` formatter={(value) => [`${Number(value).toLocaleString()} kg`, "Volume"]} `` → `` formatter={(value) => [`${format.number(Number(value))} kg`, t("volume")]} ``
- `name="Volume (kg)"` → `name={t("chartVolumeSeries")}`

- [ ] **Step 5: Gate, browser check, commit**

`npx tsc --noEmit && npm run lint && npm test`.

The dashboard in Thai shows ฝึกต่อเนื่อง N วัน, the stat tiles, the chart tooltip "ปริมาณรวม: 12,480 kg", and recent rows like "วันนี้ · 12 เซ็ต · 4,200 kg · 1 ชม. 05 นาที". Discarding an in-progress workout shows a Thai dialog.

```bash
git add "app/(app)/dashboard" messages
git commit -m "feat(i18n): translate dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Workout logging flow

**Files:**
- Modify: `app/(app)/log/page.tsx`, `app/(app)/log/StartSessionButtons.tsx`, `app/(app)/log/useStartSession.ts`, `app/(app)/log/[sessionId]/LoggingClient.tsx`, `app/(app)/log/[sessionId]/ExerciseCard.tsx`, `app/(app)/log/[sessionId]/SetForm.tsx`, `app/(app)/log/[sessionId]/SetEditor.tsx`, `app/(app)/log/[sessionId]/SessionNotes.tsx`, `app/(app)/log/[sessionId]/RestTimer.tsx`, `messages/en.json`, `messages/th.json`

**Interfaces:**
- Consumes: `common.*`, `errors.*` (Task 3); `tc` in `LoggingClient` / `ExerciseCard` and `locale`/`tc` in `log/page.tsx` (Task 2).
- Produces: namespace `log`.

- [ ] **Step 1: Messages.** en.json:

```json
  "log": {
    "title": "Start a Workout",
    "inProgress": "You have a workout in progress",
    "resume": "Resume",
    "warmup": "Warmup",
    "weightLabel": "Weight (kg)",
    "repsLabel": "Reps",
    "editWarmup": "Edit warmup",
    "editSet": "Edit set {number}",
    "tapToDelete": "Tap to delete",
    "addNote": "Add a note",
    "notes": "Notes",
    "saving": "Saving…",
    "saved": "Saved",
    "saveNoteFailed": "Couldn't save — try again",
    "notesPlaceholder": "How did it feel? Seat height, grip, anything to remember…",
    "restLength": "Rest timer length {seconds} seconds, tap to change",
    "restSeconds": "{seconds}s",
    "restGo": "Go!",
    "restOver": "Rest over",
    "restAdd": "+30s",
    "restDismiss": "Dismiss rest timer",
    "restSkip": "Skip rest",
    "targetProgress": "{done}/{target} sets",
    "topSet": "top {weight}×{reps}",
    "notStarted": "Not started",
    "notStartedLast": "Not started · last {sets}",
    "blocked": "Add a set or remove this exercise.",
    "blockedBeforeFinish": "Add a set or remove this exercise before finishing.",
    "lastTime": "Last · {date}: {sets}",
    "removeExerciseLabel": "Remove {name}",
    "editSetLabel": "Edit set {number}: {weight} kg × {reps}",
    "editWarmupLabel": "Edit warmup set: {weight} kg × {reps}",
    "addSet": "Add Set",
    "prToast": "New PR on {name}: {pr}!",
    "thisExercise": "this exercise",
    "finishNoExercises": "Add an exercise and log at least one set before finishing.",
    "finishEmptyExercises": "Remove or add a set to {names} before finishing.",
    "justStarted": "just started",
    "discardLabel": "Discard workout",
    "noExercises": "No exercises yet — add one below to start logging sets.",
    "finish": "Finish",
    "discardTitle": "Discard this workout?",
    "discardDescription": "This workout and any sets logged in it will be permanently deleted.",
    "discard": "Discard",
    "cantFinish": "Can't finish yet",
    "gotIt": "Got it",
    "removeTitle": "Remove this exercise?",
    "removeDescription": "“{name}” and its {count, plural, one {# logged set} other {# logged sets}} will be removed from this workout."
  }
```

th.json:

```json
  "log": {
    "title": "เริ่มฝึก",
    "inProgress": "คุณมีการฝึกที่ยังไม่จบ",
    "resume": "ฝึกต่อ",
    "warmup": "วอร์มอัพ",
    "weightLabel": "น้ำหนัก (kg)",
    "repsLabel": "ครั้ง",
    "editWarmup": "แก้ไขเซ็ตวอร์มอัพ",
    "editSet": "แก้ไขเซ็ต {number}",
    "tapToDelete": "แตะอีกครั้งเพื่อลบ",
    "addNote": "เพิ่มโน้ต",
    "notes": "โน้ต",
    "saving": "กำลังบันทึก…",
    "saved": "บันทึกแล้ว",
    "saveNoteFailed": "บันทึกไม่สำเร็จ — ลองอีกครั้ง",
    "notesPlaceholder": "รู้สึกอย่างไร? ระดับเบาะ การจับ หรืออะไรที่อยากจำไว้…",
    "restLength": "เวลาพัก {seconds} วินาที แตะเพื่อเปลี่ยน",
    "restSeconds": "{seconds} วิ",
    "restGo": "ไปต่อ!",
    "restOver": "หมดเวลาพัก",
    "restAdd": "+30 วิ",
    "restDismiss": "ปิดตัวจับเวลาพัก",
    "restSkip": "ข้ามการพัก",
    "targetProgress": "{done}/{target} เซ็ต",
    "topSet": "สูงสุด {weight}×{reps}",
    "notStarted": "ยังไม่เริ่ม",
    "notStartedLast": "ยังไม่เริ่ม · ครั้งก่อน {sets}",
    "blocked": "เพิ่มเซ็ต หรือเอาท่านี้ออก",
    "blockedBeforeFinish": "เพิ่มเซ็ต หรือเอาท่านี้ออกก่อนจบการฝึก",
    "lastTime": "ครั้งก่อน · {date}: {sets}",
    "removeExerciseLabel": "เอา {name} ออก",
    "editSetLabel": "แก้ไขเซ็ต {number}: {weight} kg × {reps}",
    "editWarmupLabel": "แก้ไขเซ็ตวอร์มอัพ: {weight} kg × {reps}",
    "addSet": "เพิ่มเซ็ต",
    "prToast": "PR ใหม่ของ {name}: {pr}!",
    "thisExercise": "ท่านี้",
    "finishNoExercises": "เพิ่มท่าและบันทึกอย่างน้อยหนึ่งเซ็ตก่อนจบการฝึก",
    "finishEmptyExercises": "เอาออก หรือเพิ่มเซ็ตให้ {names} ก่อนจบการฝึก",
    "justStarted": "เพิ่งเริ่ม",
    "discardLabel": "ยกเลิกการฝึก",
    "noExercises": "ยังไม่มีท่า — เพิ่มท่าด้านล่างเพื่อเริ่มบันทึกเซ็ต",
    "finish": "จบการฝึก",
    "discardTitle": "ยกเลิกการฝึกนี้?",
    "discardDescription": "การฝึกนี้และทุกเซ็ตที่บันทึกไว้จะถูกลบถาวร",
    "discard": "ยกเลิกการฝึก",
    "cantFinish": "ยังจบการฝึกไม่ได้",
    "gotIt": "เข้าใจแล้ว",
    "removeTitle": "เอาท่านี้ออก?",
    "removeDescription": "“{name}” และ {count, plural, other {# เซ็ต}}ที่บันทึกไว้จะถูกเอาออกจากการฝึกนี้"
  }
```

- [ ] **Step 2: Start screen**

`log/page.tsx`: extend the Task 2 line to `const [locale, tc, t] = await Promise.all([getLocale(), getTranslations("common"), getTranslations("log")]);`. Then `Start a Workout` → `{t("title")}`, `You have a workout in progress` → `{t("inProgress")}`, `Resume` → `{t("resume")}`.

`StartSessionButtons.tsx`: add `const tc = useTranslations("common");`, and `Freeform Workout` → `{tc("freeformWorkout")}`.

`useStartSession.ts`: add `import { useTranslations } from "next-intl";` and `const te = useTranslations("errors");` at the top of the hook. The catch becomes:

```ts
    } catch (err) {
      console.error(err);
      setError(te("startWorkout"));
      setPendingKey(null);
      inFlight.current = false;
    }
```

- [ ] **Step 3: Set inputs**

`SetForm.tsx`: in `WarmupToggle`, add `const t = useTranslations("log");` and `Warmup` → `{t("warmup")}`. In `WeightRepsFields`, add `const t = useTranslations("log");`, `label="Weight (kg)"` → `label={t("weightLabel")}`, and `label="Reps"` → `label={t("repsLabel")}`.

`SetEditor.tsx`: add `const t = useTranslations("log"); const tc = useTranslations("common");`.
- `` {setNumber === null ? "Edit warmup" : `Edit set ${setNumber}`} `` → `{setNumber === null ? t("editWarmup") : t("editSet", { number: setNumber })}`
- `{confirmDelete ? "Tap to delete" : "Delete"}` → `{confirmDelete ? t("tapToDelete") : tc("delete")}`
- `Cancel` → `{tc("cancel")}`; `Save` → `{tc("save")}`

- [ ] **Step 4: Notes and rest timer**

`SessionNotes.tsx`: add `const t = useTranslations("log");`.

| Old | New |
|---|---|
| `Add a note` | `{t("addNote")}` |
| `Notes` (label) | `{t("notes")}` |
| `"Saving…"` / `"Saved"` | `t("saving")` / `t("saved")` |
| `Couldn&apos;t save — try again` | `{t("saveNoteFailed")}` |
| `placeholder="How did it feel? …"` | `placeholder={t("notesPlaceholder")}` |

`RestTimer.tsx`: add `const t = useTranslations("log");` as the component's first line.

| Old | New |
|---|---|
| `` aria-label={`Rest timer length ${duration} seconds, tap to change`} `` | `aria-label={t("restLength", { seconds: duration })}` |
| `{duration}s` | `{t("restSeconds", { seconds: duration })}` |
| `{done ? "Go!" : formatClock(remaining)}` | `{done ? t("restGo") : formatClock(remaining)}` |
| `{done ? "Rest over" : ""}` | `{done ? t("restOver") : ""}` |
| `+30s` | `{t("restAdd")}` |
| `aria-label={done ? "Dismiss rest timer" : "Skip rest"}` | `aria-label={done ? t("restDismiss") : t("restSkip")}` |

- [ ] **Step 5: `ExerciseCard.tsx`**

`LastTimeHint`: add `const t = useTranslations("log");` next to `locale`. The span body becomes `{t("lastTime", { date: formatShortDate(last.sessionDate, locale), sets: formatLastSets(last.sets) })}`.

`ExerciseCard`: add `const t = useTranslations("log");` next to `tc`.

| Old | New |
|---|---|
| `{workingSets}/{exercise.targetSets} sets` | `{t("targetProgress", { done: workingSets, target: exercise.targetSets })}` |
| the collapsed summary ternary | see below |
| `Add a set or remove this exercise.` | `{t("blocked")}` |
| `aria-label={\`Remove ${exercise.exerciseName}\`}` | `aria-label={t("removeExerciseLabel", { name: exercise.exerciseName })}` |
| `Add a set or remove this exercise before finishing.` | `{t("blockedBeforeFinish")}` |
| `<span>Set</span>` / `Weight` / `Reps` | `{tc("setColumn")}` / `{tc("weightColumn")}` / `{tc("repsColumn")}` |
| `Add Set` | `{t("addSet")}` |

Collapsed summary:

```tsx
              {exercise.sets.length > 0
                ? `${tc("setCount", countSets(exercise.sets))}${
                    top ? ` · ${t("topSet", { weight: top.weight_kg, reps: top.reps })}` : ""
                  }`
                : exercise.lastSession && exercise.lastSession.sets.length > 0
                  ? t("notStartedLast", { sets: formatLastSets(exercise.lastSession.sets) })
                  : t("notStarted")}
```

Set-row aria-label:

```tsx
                    aria-label={
                      set.is_warmup
                        ? t("editWarmupLabel", { weight: set.weight_kg, reps: set.reps })
                        : t("editSetLabel", { number: setNumbers[i] ?? 0, weight: set.weight_kg, reps: set.reps })
                    }
```

- [ ] **Step 6: `LoggingClient.tsx`**

Add `const t = useTranslations("log"); const te = useTranslations("errors"); const format = useFormatter();` next to `tc`, and add `useFormatter` to the `next-intl` import.

- `announcePr`: `` setToast(`New PR on ${…}: ${formatPr(pr)}!`) `` → `setToast(t("prToast", { name: exercise?.exerciseName ?? t("thisExercise"), pr: formatPr(pr) }))`
- `logSetMutation.onError`: `"Failed to save that set — check your connection and try again."` → `te("saveSetOffline")`
- `handleUpdateSet` catch → `console.error(err); setError(sessionExerciseId, te("saveSet"));`
- `handleDeleteSet` catch (after the rollback) → `console.error(err); setError(sessionExerciseId, te("deleteSet"));`
- `handleRemoveExercise` catch (after the rollback) → `console.error(err); setError(sessionExerciseId, te("removeExercise"));`
- `handleFinish`:
  - `setFinishError("Add an exercise and log at least one set before finishing.")` → `setFinishError(t("finishNoExercises"))`
  - the template → `setFinishError(t("finishEmptyExercises", { names: emptyExercises.map((e) => e.exerciseName).join(", ") }))`
  - catch → `console.error(err); setFinishError(te("finishWorkout"));`
- `handleDiscard` catch → `console.error(err); setDiscardError(te("discardWorkout"));`
- Header summary `<p>` body becomes:

```tsx
            {tc("exercises", { count: summary.exerciseCount })} ·{" "}
            {tc("sets", { count: summary.setCount })}
            {summary.totalVolumeKg > 0 && ` · ${format.number(summary.totalVolumeKg)} kg`}
            {elapsedMinutes !== null &&
              ` · ${elapsedMinutes > 0 ? tc("duration", splitDuration(elapsedMinutes)) : t("justStarted")}`}
```

| Old | New |
|---|---|
| `aria-label="Discard workout"` | `aria-label={t("discardLabel")}` |
| `No exercises yet — add one below to start logging sets.` | `{t("noExercises")}` |
| `Finish` | `{t("finish")}` |
| `title="Discard this workout?"` | `title={t("discardTitle")}` |
| `"This workout and any sets logged in it will be permanently deleted."` | `t("discardDescription")` |
| `confirmLabel="Discard"` | `confirmLabel={t("discard")}` |
| `title="Can't finish yet"` / `confirmLabel="Got it"` | `title={t("cantFinish")}` / `confirmLabel={t("gotIt")}` |
| `title="Remove this exercise?"` / `confirmLabel="Remove"` | `title={t("removeTitle")}` / `confirmLabel={tc("remove")}` |

The remove-dialog description becomes:

```tsx
        description={
          removeTarget &&
          t("removeDescription", { name: removeTarget.exerciseName, count: removeTarget.sets.length })
        }
```

- [ ] **Step 7: Gate, browser check, commit**

`npx tsc --noEmit && npm run lint && npm test`.

In Thai, run the whole loop:
1. Start a freeform workout ("ฝึกอิสระ").
2. Add an exercise via the picker and log 2 sets, one of them warmup.
3. Watch the rest timer count down to "ไปต่อ!".
4. Edit a set: the delete confirm reads "แตะอีกครั้งเพื่อลบ".
5. Add a note: it shows "บันทึกแล้ว".
6. Tap จบการฝึก with an empty exercise: the "ยังจบการฝึกไม่ได้" dialog lists it.
7. Remove it and finish.

The header line reads "1 ท่า · 1 เซ็ต · 100 kg · เพิ่งเริ่ม". Repeat quickly in English and compare with the old copy. Check that the 375px sticky action bar doesn't overflow.

```bash
git add "app/(app)/log" messages
git commit -m "feat(i18n): translate workout logging flow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: History list and workout summary

**Files:**
- Modify: `app/(app)/history/page.tsx`, `app/(app)/history/DeleteHistorySessionButton.tsx`, `app/(app)/history/[sessionId]/page.tsx`, `messages/en.json`, `messages/th.json`

**Interfaces:**
- Consumes: `locale` / `tc` / `relativeLabels` / `freeform` in both pages (Task 2); `errors.deleteWorkout`, `common.*Column` (Task 3).
- Produces: namespace `history`.

- [ ] **Step 1: Messages.** en.json:

```json
  "history": {
    "title": "History",
    "emptyTitle": "No workouts logged yet",
    "emptyDescription": "Finished sessions show up here so you can look back on your progress.",
    "startWorkout": "Start a workout",
    "showMore": "Show more",
    "deleteLabel": "Delete workout",
    "deleteTitle": "Delete this workout?",
    "deleteDescription": "“{name}” and all its logged sets will be permanently deleted. This cannot be undone.",
    "complete": "Workout complete",
    "niceWorkPrs": "Nice work — {count, plural, one {# new PR} other {# new PRs}} today.",
    "niceWorkSaved": "Nice work — it's saved to your history.",
    "backToDashboard": "Back to dashboard",
    "volumeChange": "{change}% volume vs last time ({date})",
    "tileExercises": "exercises",
    "tileSets": "sets",
    "tileVolume": "kg volume",
    "newPrs": "New personal records",
    "noExercises": "No exercises were logged in this workout.",
    "noSets": "No sets logged.",
    "topSet": "Top set {weight} kg × {reps}"
  }
```

th.json:

```json
  "history": {
    "title": "ประวัติ",
    "emptyTitle": "ยังไม่มีการฝึกที่บันทึกไว้",
    "emptyDescription": "การฝึกที่จบแล้วจะแสดงที่นี่ ให้คุณย้อนดูความก้าวหน้าได้",
    "startWorkout": "เริ่มฝึก",
    "showMore": "แสดงเพิ่ม",
    "deleteLabel": "ลบการฝึก",
    "deleteTitle": "ลบการฝึกนี้?",
    "deleteDescription": "“{name}” และทุกเซ็ตที่บันทึกไว้จะถูกลบถาวร ไม่สามารถย้อนกลับได้",
    "complete": "ฝึกเสร็จแล้ว",
    "niceWorkPrs": "เยี่ยมมาก — วันนี้ทำ PR ใหม่ได้ {count, plural, other {# รายการ}}",
    "niceWorkSaved": "เยี่ยมมาก — บันทึกลงประวัติแล้ว",
    "backToDashboard": "กลับหน้าหลัก",
    "volumeChange": "ปริมาณรวม {change}% เทียบกับครั้งก่อน ({date})",
    "tileExercises": "ท่า",
    "tileSets": "เซ็ต",
    "tileVolume": "kg ปริมาณรวม",
    "newPrs": "สถิติส่วนตัวใหม่",
    "noExercises": "ไม่มีท่าที่บันทึกไว้ในการฝึกนี้",
    "noSets": "ไม่มีเซ็ตที่บันทึกไว้",
    "topSet": "เซ็ตสูงสุด {weight} kg × {reps}"
  }
```

- [ ] **Step 2: `history/page.tsx`**

Extend the Task 2 line to `const [locale, tc, t, format] = await Promise.all([getLocale(), getTranslations("common"), getTranslations("history"), getFormatter()]);`, importing `getFormatter`.

| Old | New |
|---|---|
| `>History<` | `>{t("title")}<` |
| `title="No workouts logged yet"` / `description="Finished sessions…"` | `title={t("emptyTitle")}` / `description={t("emptyDescription")}` |
| `Start a workout` | `{t("startWorkout")}` |
| `Show more` | `{t("showMore")}` |

The third row line becomes:

```tsx
                      <span className="block truncate text-sm text-muted tabular-nums">
                        {tc("exercises", { count: session.stats.exerciseCount })} ·{" "}
                        {tc("sets", { count: session.stats.setCount })} ·{" "}
                        {format.number(session.stats.volumeKg)} kg
                      </span>
```

- [ ] **Step 3: `DeleteHistorySessionButton.tsx`**

Add `import { useTranslations } from "next-intl";` and `const t = useTranslations("history"); const tc = useTranslations("common"); const te = useTranslations("errors");`. The catch becomes `console.error(err); setError(te("deleteWorkout"));`. Then: `aria-label={t("deleteLabel")}`, `title={t("deleteTitle")}`, `description={t("deleteDescription", { name: sessionName })}`, `confirmLabel={tc("delete")}`.

- [ ] **Step 4: `history/[sessionId]/page.tsx`**

`VolumeComparison` (sync): add `const t = useTranslations("history");` (import `useTranslations` with `useLocale`). The span body becomes:

```tsx
      <span>
        {t("volumeChange", {
          change: `${up ? "+" : ""}${change}`,
          date: formatSessionDate(previous.sessionDate, locale),
        })}
      </span>
```

Page: add `getFormatter` to the `next-intl/server` import, then extend the Task 2 line to `const [locale, tc, t, format] = await Promise.all([getLocale(), getTranslations("common"), getTranslations("history"), getFormatter()]);`.

| Old | New |
|---|---|
| `Workout complete` | `{t("complete")}` |
| the `prs.length > 0 ? \`Nice work — …\` : "Nice work — it's saved…"` ternary | `prs.length > 0 ? t("niceWorkPrs", { count: prs.length }) : t("niceWorkSaved")` |
| `Back to dashboard` | `{t("backToDashboard")}` |
| `label="exercises"` / `label="sets"` | `label={t("tileExercises")}` / `label={t("tileSets")}` |
| `value={summary.totalVolumeKg.toLocaleString()} label="kg volume"` | `value={format.number(summary.totalVolumeKg)} label={t("tileVolume")}` |
| `New personal records` | `{t("newPrs")}` |
| `No exercises were logged in this workout.` | `{t("noExercises")}` |
| `No sets logged.` | `{t("noSets")}` |
| `<span>Set</span>` / `Weight` / `Reps` | `{tc("setColumn")}` / `{tc("weightColumn")}` / `{tc("repsColumn")}` |
| `Top set {top.weight_kg} kg × {top.reps}` | `{t("topSet", { weight: top.weight_kg, reps: top.reps })}` |

- [ ] **Step 5: Gate, browser check, commit**

`npx tsc --noEmit && npm run lint && npm test`.

- In Thai, `/history` groups by "กันยายน 2569".
- Rows read "3 ท่า · 12 เซ็ต · 4,200 kg".
- Finishing a workout lands on "ฝึกเสร็จแล้ว" with the PR line and "ปริมาณรวม +8% เทียบกับครั้งก่อน (19 ก.ย. 2569)".
- The delete dialog quotes the session name.

```bash
git add "app/(app)/history" messages
git commit -m "feat(i18n): translate history and workout summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Routines + translated form validation

**Files:**
- Modify: `lib/validation.ts`, `lib/validation.test.ts`, `app/(app)/routines/page.tsx`, `app/(app)/routines/CreateRoutineForm.tsx`, `app/(app)/routines/DeleteRoutineButton.tsx`, `app/(app)/routines/StartRoutineButton.tsx`, `app/(app)/routines/[routineId]/page.tsx`, `app/(app)/routines/[routineId]/RoutineExerciseRow.tsx`, `messages/en.json`, `messages/th.json`
- Create: `i18n/useValidationMessage.ts`

**Interfaces:**
- Consumes: `muscleLabel` (Task 3); `errors.*` (Task 3).
- Produces: `VALIDATION_KEYS`, `type ValidationKey`, `isValidationKey(value: unknown): value is ValidationKey` (`lib/validation.ts`); `useValidationMessage(): (message: string | undefined) => string | undefined`; namespaces `routines`, `validation`.

- [ ] **Step 1: Failing test** (`lib/validation.test.ts`)

Add `isValidationKey` to the import, and append:

```ts
describe("validation messages", () => {
  it("are message keys, translated in the UI", () => {
    const empty = createRoutineSchema.safeParse({ name: "" });
    expect(empty.error?.issues[0].message).toBe("nameRequired");
    const long = createExerciseSchema.safeParse({ name: "x".repeat(101), muscleGroup: "Chest" });
    expect(long.error?.issues[0].message).toBe("nameTooLong");
  });

  it("recognizes only known keys", () => {
    expect(isValidationKey("nameRequired")).toBe(true);
    expect(isValidationKey("Name is required")).toBe(false);
  });
});
```

Run: `npx vitest run lib/validation.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement in `lib/validation.ts`**

Below `isMuscleGroup`, add:

```ts
// Schema messages that reach the UI (via react-hook-form) are keys into the `validation`
// message namespace, not display text — see i18n/useValidationMessage.ts.
export const VALIDATION_KEYS = ["nameRequired", "nameTooLong", "notesTooLong"] as const;
export type ValidationKey = (typeof VALIDATION_KEYS)[number];

export function isValidationKey(value: unknown): value is ValidationKey {
  return typeof value === "string" && (VALIDATION_KEYS as readonly string[]).includes(value);
}
```

Then change:
- In both `createExerciseSchema` and `createRoutineSchema`: `name: z.string().trim().min(1, "Name is required").max(100),` → `name: z.string().trim().min(1, "nameRequired").max(100, "nameTooLong"),`
- `notes: z.string().max(500, "Notes must be 500 characters or fewer"),` → `notes: z.string().max(500, "notesTooLong"),`

Run: `npx vitest run lib/validation.test.ts`. Expected: PASS.

- [ ] **Step 3: Create `i18n/useValidationMessage.ts`**

```ts
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
```

- [ ] **Step 4: Messages.** en.json:

```json
  "validation": {
    "nameRequired": "Name is required",
    "nameTooLong": "Name must be 100 characters or fewer",
    "notesTooLong": "Notes must be 500 characters or fewer"
  },
  "routines": {
    "title": "Routines",
    "emptyTitle": "No routines yet",
    "emptyDescription": "Create one above to line up your exercises before a workout.",
    "nameLabel": "Routine name",
    "namePlaceholder": "e.g. Push Day",
    "create": "Create",
    "deleteLabel": "Delete routine",
    "deleteTitle": "Delete this routine?",
    "deleteDescription": "“{name}” will be permanently deleted. This cannot be undone.",
    "start": "Start",
    "startLabel": "Start {name}",
    "editorEmptyTitle": "No exercises in this routine",
    "editorEmptyDescription": "Add exercises below in the order you'll do them.",
    "moveUp": "Move {name} up",
    "moveDown": "Move {name} down",
    "removeLabel": "Remove {name} from routine",
    "targetSets": "Target sets",
    "fewerTarget": "Fewer target sets for {name}",
    "moreTarget": "More target sets for {name}",
    "removeTitle": "Remove from routine?",
    "removeDescription": "“{name}” will be removed from this routine. Past workouts aren't affected."
  }
```

th.json:

```json
  "validation": {
    "nameRequired": "กรุณาใส่ชื่อ",
    "nameTooLong": "ชื่อต้องไม่เกิน 100 ตัวอักษร",
    "notesTooLong": "โน้ตต้องไม่เกิน 500 ตัวอักษร"
  },
  "routines": {
    "title": "โปรแกรม",
    "emptyTitle": "ยังไม่มีโปรแกรม",
    "emptyDescription": "สร้างโปรแกรมด้านบนเพื่อจัดลำดับท่าก่อนเริ่มฝึก",
    "nameLabel": "ชื่อโปรแกรม",
    "namePlaceholder": "เช่น Push Day",
    "create": "สร้าง",
    "deleteLabel": "ลบโปรแกรม",
    "deleteTitle": "ลบโปรแกรมนี้?",
    "deleteDescription": "“{name}” จะถูกลบถาวร ไม่สามารถย้อนกลับได้",
    "start": "เริ่ม",
    "startLabel": "เริ่ม {name}",
    "editorEmptyTitle": "ยังไม่มีท่าในโปรแกรมนี้",
    "editorEmptyDescription": "เพิ่มท่าด้านล่างตามลำดับที่จะฝึก",
    "moveUp": "เลื่อน {name} ขึ้น",
    "moveDown": "เลื่อน {name} ลง",
    "removeLabel": "เอา {name} ออกจากโปรแกรม",
    "targetSets": "เซ็ตเป้าหมาย",
    "fewerTarget": "ลดเซ็ตเป้าหมายของ {name}",
    "moreTarget": "เพิ่มเซ็ตเป้าหมายของ {name}",
    "removeTitle": "เอาออกจากโปรแกรม?",
    "removeDescription": "“{name}” จะถูกเอาออกจากโปรแกรมนี้ การฝึกที่ผ่านมาไม่ได้รับผลกระทบ"
  }
```

- [ ] **Step 5: Pages and components**

`routines/page.tsx`: add `import { getTranslations } from "next-intl/server";` and `const t = await getTranslations("routines");`. `Routines` → `{t("title")}`; the EmptyState `title` / `description` → `t("emptyTitle")` / `t("emptyDescription")`.

`CreateRoutineForm.tsx`: add `import { useTranslations } from "next-intl";` and `import { useValidationMessage } from "@/i18n/useValidationMessage";`, then `const t = useTranslations("routines"); const te = useTranslations("errors"); const validationMessage = useValidationMessage();`.
- The catch becomes `console.error(err); setError("root", { message: te("createRoutine") });`
- `label="Routine name"` → `label={t("nameLabel")}`; `placeholder="e.g. Push Day"` → `placeholder={t("namePlaceholder")}`
- `error={errors.name?.message}` → `error={validationMessage(errors.name?.message)}`
- `Create` → `{t("create")}`

`DeleteRoutineButton.tsx`: add `const t = useTranslations("routines"); const tc = useTranslations("common"); const te = useTranslations("errors");`. The catch becomes `console.error(err); setError(te("deleteRoutine"));`. Then `aria-label={t("deleteLabel")}`, `title={t("deleteTitle")}`, `description={t("deleteDescription", { name: routineName })}`, `confirmLabel={tc("delete")}`.

`StartRoutineButton.tsx`: add `const t = useTranslations("routines");`. Then `` aria-label={`Start ${routine.name}`} `` → `aria-label={t("startLabel", { name: routine.name })}`, and both `Start` → `{t("start")}`.

`routines/[routineId]/page.tsx`: add `import { getTranslations } from "next-intl/server";` and `const [t, tc] = await Promise.all([getTranslations("routines"), getTranslations("common")]);` after `notFound()`.
- `{exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}` → `{tc("exercises", { count: exercises.length })}`
- The EmptyState title / description → `t("editorEmptyTitle")` / `t("editorEmptyDescription")`

`RoutineExerciseRow.tsx`: add `import { useTranslations } from "next-intl";` and `import { muscleLabel } from "@/components/ui/muscle";`, then `const t = useTranslations("routines"); const tc = useTranslations("common"); const tm = useTranslations("muscle"); const te = useTranslations("errors");`.
- `run()`: change the third parameter `fallback: string` to `fallbackKey: "moveExercise" | "removeExercise" | "updateTargetSets"`, and the catch to `console.error(err); setError(te(fallbackKey));`
- The call sites pass `"updateTargetSets"`, `"moveExercise"` (2×) and `"removeExercise"` instead of the English strings

| Old | New |
|---|---|
| `<p className="text-xs text-muted">{muscleGroup}</p>` | `<p className="text-xs text-muted">{muscleLabel(tm, muscleGroup)}</p>` |
| `` aria-label={`Move ${name} up`} `` | `aria-label={t("moveUp", { name })}` |
| `` aria-label={`Move ${name} down`} `` | `aria-label={t("moveDown", { name })}` |
| `` aria-label={`Remove ${name} from routine`} `` | `aria-label={t("removeLabel", { name })}` |
| `Target sets` | `{t("targetSets")}` |
| `` aria-label={`Fewer target sets for ${name}`} `` | `aria-label={t("fewerTarget", { name })}` |
| `` aria-label={`More target sets for ${name}`} `` | `aria-label={t("moreTarget", { name })}` |
| `title="Remove from routine?"` | `title={t("removeTitle")}` |
| ``description={`"${name}" will be removed…`}`` | `description={t("removeDescription", { name })}` |
| `confirmLabel="Remove"` | `confirmLabel={tc("remove")}` |

- [ ] **Step 6: Gate, browser check, commit**

`npx tsc --noEmit && npm run lint && npm test`.

In Thai:
- Submit an empty routine name: "กรุณาใส่ชื่อ" shows under the field.
- Create a routine and add exercises: the muscle line reads "อก".
- Step the target sets and reorder.
- The remove and delete dialogs are Thai.
- The routines list shows "3 ท่า · Bench Press, Squat…".

```bash
git add lib/validation.ts lib/validation.test.ts i18n/useValidationMessage.ts "app/(app)/routines" messages
git commit -m "feat(i18n): translate routines and form validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Exercises (list, form, progress page, chart)

**Files:**
- Modify: `app/(app)/exercises/page.tsx`, `app/(app)/exercises/NewExercise.tsx`, `app/(app)/exercises/AddExerciseForm.tsx`, `app/(app)/exercises/ArchiveExerciseButton.tsx`, `app/(app)/exercises/ExerciseList.tsx`, `app/(app)/exercises/[exerciseId]/page.tsx`, `app/(app)/exercises/[exerciseId]/ProgressChart.tsx`, `app/(app)/exercises/[exerciseId]/ProgressChartInner.tsx`, `messages/en.json`, `messages/th.json`

**Interfaces:**
- Consumes: `muscleLabel` (Task 3), `useValidationMessage` (Task 8), `locale` / `tc` / `relativeLabels` in the detail page and `locale` / `tc` in `ExerciseList` (Task 2).
- Produces: namespace `exercises`.

- [ ] **Step 1: Messages.** en.json:

```json
  "exercises": {
    "title": "Exercises",
    "newExercise": "New exercise",
    "closeForm": "Close new exercise form",
    "nameLabel": "Exercise name",
    "namePlaceholder": "e.g. Bicep Curl",
    "muscleGroup": "Muscle group",
    "add": "Add",
    "archiveLabel": "Archive exercise",
    "searchLabel": "Search exercises",
    "searchPlaceholder": "Search exercises…",
    "filterLabel": "Filter by muscle group",
    "noMatchTitle": "No matching exercises",
    "noMatchDescription": "Try another name or muscle group — or add it as a new exercise.",
    "lastDone": "Last {when}",
    "emptyTitle": "No sets logged yet",
    "emptyDescription": "Log this exercise in a workout and your progress chart and history will show up here.",
    "bestE1rm": "Best e1RM",
    "sessions": "Sessions",
    "history": "History",
    "metricLabel": "Chart metric",
    "maxWeight": "Max weight",
    "e1rm": "Est. 1RM",
    "volume": "Volume"
  }
```

th.json:

```json
  "exercises": {
    "title": "ท่าออกกำลังกาย",
    "newExercise": "เพิ่มท่าใหม่",
    "closeForm": "ปิดฟอร์มเพิ่มท่าใหม่",
    "nameLabel": "ชื่อท่า",
    "namePlaceholder": "เช่น Bicep Curl",
    "muscleGroup": "กลุ่มกล้ามเนื้อ",
    "add": "เพิ่ม",
    "archiveLabel": "เก็บท่านี้เข้าคลัง",
    "searchLabel": "ค้นหาท่า",
    "searchPlaceholder": "ค้นหาท่า…",
    "filterLabel": "กรองตามกลุ่มกล้ามเนื้อ",
    "noMatchTitle": "ไม่พบท่าที่ตรงกัน",
    "noMatchDescription": "ลองชื่อหรือกลุ่มกล้ามเนื้ออื่น หรือเพิ่มเป็นท่าใหม่",
    "lastDone": "ล่าสุด {when}",
    "emptyTitle": "ยังไม่มีเซ็ตที่บันทึก",
    "emptyDescription": "บันทึกท่านี้ในการฝึก แล้วกราฟความก้าวหน้าและประวัติจะแสดงที่นี่",
    "bestE1rm": "e1RM สูงสุด",
    "sessions": "จำนวนครั้งที่ฝึก",
    "history": "ประวัติ",
    "metricLabel": "ตัวชี้วัดของกราฟ",
    "maxWeight": "น้ำหนักสูงสุด",
    "e1rm": "1RM โดยประมาณ",
    "volume": "ปริมาณรวม"
  }
```

- [ ] **Step 2: List page, header, form, archive**

`exercises/page.tsx`: add `import { getTranslations } from "next-intl/server";` and `const t = await getTranslations("exercises");`. Then `<NewExerciseHeader title="Exercises" />` → `<NewExerciseHeader title={t("title")} />`.

`NewExercise.tsx`: add `const t = useTranslations("exercises");`. `New exercise` → `{t("newExercise")}`.

`AddExerciseForm.tsx`: add `import { useTranslations } from "next-intl";`, `import { useValidationMessage } from "@/i18n/useValidationMessage";` and `import { muscleLabel } from "@/components/ui/muscle";`. Then `const t = useTranslations("exercises"); const tm = useTranslations("muscle"); const te = useTranslations("errors"); const validationMessage = useValidationMessage();`.
- The catch becomes `console.error(err); setError("root", { message: te("createExercise") });`

| Old | New |
|---|---|
| `<h2 className="font-medium">New exercise</h2>` | `<h2 className="font-medium">{t("newExercise")}</h2>` |
| `aria-label="Close new exercise form"` | `aria-label={t("closeForm")}` |
| `label="Exercise name"` / `placeholder="e.g. Bicep Curl"` | `label={t("nameLabel")}` / `placeholder={t("namePlaceholder")}` |
| `error={errors.name?.message}` | `error={validationMessage(errors.name?.message)}` |
| `label="Muscle group"` | `label={t("muscleGroup")}` |
| `{group}` inside `<option>` | `{muscleLabel(tm, group)}` |
| `Add` | `{t("add")}` |
| `{errors.muscleGroup.message}` | `{validationMessage(errors.muscleGroup.message)}` |

`ArchiveExerciseButton.tsx`: add `const t = useTranslations("exercises"); const te = useTranslations("errors");`. The catch becomes `console.error(err); setError(te("archiveExercise"));`, and `aria-label="Archive exercise"` → `aria-label={t("archiveLabel")}`.

- [ ] **Step 3: `ExerciseList.tsx`**

Add `const t = useTranslations("exercises"); const tm = useTranslations("muscle");` (and `import { muscleLabel } from "@/components/ui/muscle";`).

| Old | New |
|---|---|
| `placeholder="Search exercises…"` / `aria-label="Search exercises"` | `placeholder={t("searchPlaceholder")}` / `aria-label={t("searchLabel")}` |
| `aria-label="Filter by muscle group"` | `aria-label={t("filterLabel")}` |
| `{option ?? "All"}` | `{option === null ? tc("all") : muscleLabel(tm, option)}` |
| EmptyState `title="No matching exercises"` / `description="Try another…"` | `title={t("noMatchTitle")}` / `description={t("noMatchDescription")}` |
| `{exercise.muscle_group}` inside the Badge | `{muscleLabel(tm, exercise.muscle_group)}` |
| `` {stat.lastDate && `Last ${formatRelativeDate(…)}`} `` | `{stat.lastDate && t("lastDone", { when: formatRelativeDate(stat.lastDate, today, locale, { today: tc("today"), yesterday: tc("yesterday") }) })}` |

`PR {formatPr(stat.pr)}` stays as is ("PR" is never translated).

- [ ] **Step 4: Detail page and chart**

`exercises/[exerciseId]/page.tsx`: extend the Task 2 line to `const [locale, tc, t, tm] = await Promise.all([getLocale(), getTranslations("common"), getTranslations("exercises"), getTranslations("muscle")]);` and add `import { muscleLabel } from "@/components/ui/muscle";`.

| Old | New |
|---|---|
| `<p className="text-sm text-muted">{exercise.muscle_group}</p>` | `<p className="text-sm text-muted">{muscleLabel(tm, exercise.muscle_group)}</p>` |
| EmptyState `title="No sets logged yet"` / `description="Log this exercise…"` | `title={t("emptyTitle")}` / `description={t("emptyDescription")}` |
| `label="Best e1RM"` | `label={t("bestE1rm")}` |
| `label="Sessions"` | `label={t("sessions")}` |
| `<h2 className="font-medium">History</h2>` | `<h2 className="font-medium">{t("history")}</h2>` |

`ProgressChart.tsx`: replace `METRICS` with `const METRICS: ProgressMetric[] = ["maxWeight", "e1rm", "volume"];` and add `const t = useTranslations("exercises");`. Then `aria-label="Chart metric"` → `aria-label={t("metricLabel")}`, `METRICS.map(({ key, label }) =>` → `METRICS.map((key) =>`, and `{label}` → `{t(key)}`.

`ProgressChartInner.tsx`: delete `METRIC_LABEL`. Add `const t = useTranslations("exercises"); const format = useFormatter();` next to `locale`.
- The tooltip formatter → `` formatter={(value) => [`${format.number(Math.round(Number(value) * 10) / 10)} kg`, t(metric)]} ``
- `name={METRIC_LABEL[metric]}` → `name={t(metric)}`

- [ ] **Step 5: Gate, browser check, commit**

`npx tsc --noEmit && npm run lint && npm test`.

In Thai:
- `/exercises` chips read ทั้งหมด / อก / หลัง …, badges show Thai muscle names, and preset exercise names stay English.
- "ล่าสุด วันนี้" appears.
- The new-exercise form has the Thai select options; an empty submit shows "กรุณาใส่ชื่อ".
- The detail page has the metric switcher (น้ำหนักสูงสุด / 1RM โดยประมาณ / ปริมาณรวม), the tooltip "พ. 23 ก.ย. · น้ำหนักสูงสุด: 100 kg", and a day/month axis.

```bash
git add "app/(app)/exercises" messages
git commit -m "feat(i18n): translate exercises, progress page and chart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Profile, settings backup, and error codes from server actions

**Files:**
- Modify: `lib/backup/service.ts`, `lib/backup/service.test.ts`, `lib/actions/backup.ts`, `lib/actions/referrals.ts`, `app/(app)/profile/page.tsx`, `app/(app)/profile/ReferralCard.tsx`, `app/(app)/settings/BackupCard.tsx`, `messages/en.json`, `messages/th.json`

**Interfaces:**
- Consumes: `errors.backup.*`, `errors.referral.*`, `errors.exportBackup`, `errors.invalidJson`, `errors.copyLink` (Task 3); the `settings` namespace (Task 1).
- Produces:
  - `type BackupImportErrorCode = "invalidFile" | "unsupportedVersion"`
  - `class BackupImportError extends Error { code: BackupImportErrorCode }` (`lib/backup/service.ts`)
  - `ImportResult = { error: BackupImportErrorCode | "importFailed" | null; summary: ImportSummary | null }`
  - `RegenerateResult = { code: string | null; error: "notAuthenticated" | "regenerateFailed" | null }`
  - Namespaces `profile` and `settings.backup`, plus `common.routines` / `common.workouts`.

- [ ] **Step 1: Failing DB test** (`lib/backup/service.test.ts`)

Append inside `describe("backup service", …)`:

```ts
  it("tags a file that isn't a backup as invalidFile", async () => {
    await expect(importUserData(prisma, userA, { format: "nope" }, "merge")).rejects.toMatchObject({
      code: "invalidFile",
    });
  });

  it("tags a backup from an unknown version as unsupportedVersion", async () => {
    const future = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION + 1,
      exported_at: new Date().toISOString(),
      data: { exercises: [], routines: [], routine_exercises: [], sessions: [], session_exercises: [], sets: [] },
    };
    await expect(importUserData(prisma, userA, future, "merge")).rejects.toMatchObject({
      code: "unsupportedVersion",
    });
  });
```

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/backup/service.test.ts`
Expected: FAIL (the thrown Error has no `code`).

- [ ] **Step 2: Implement in `lib/backup/service.ts`**

Above `importUserData`, add:

```ts
export type BackupImportErrorCode = "invalidFile" | "unsupportedVersion";

// A rejected backup file. `code` is what the UI translates (errors.backup.*); `message` stays
// English for logs.
export class BackupImportError extends Error {
  constructor(
    public readonly code: BackupImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BackupImportError";
  }
}
```

Replace the `if (!parsed.success) { … }` block with:

```ts
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const code = issue?.path[0] === "version" ? "unsupportedVersion" : "invalidFile";
    throw new BackupImportError(code, issue?.message ?? "Invalid backup file");
  }
```

Run the DB test from Step 1 again. Expected: PASS.

- [ ] **Step 3: Server actions return codes**

`lib/actions/backup.ts`:

```ts
import {
  BackupImportError,
  exportUserData,
  importUserData,
  type BackupImportErrorCode,
  type ImportMode,
  type ImportSummary,
} from "@/lib/backup/service";

export type ImportErrorCode = BackupImportErrorCode | "importFailed";
export type ImportResult = { error: ImportErrorCode | null; summary: ImportSummary | null };
```

…and in `importBackup` the catch becomes:

```ts
  } catch (err) {
    if (err instanceof BackupImportError) return { error: err.code, summary: null };
    console.error(err);
    return { error: "importFailed", summary: null };
  }
```

`lib/actions/referrals.ts`:

```ts
export type RegenerateErrorCode = "notAuthenticated" | "regenerateFailed";
export type RegenerateResult = { code: string | null; error: RegenerateErrorCode | null };

// Assigns the current user a fresh referral code (invalidating the old one).
export async function regenerateReferralCodeAction(): Promise<RegenerateResult> {
  const user = await getAuthUser();
  if (!user) return { code: null, error: "notAuthenticated" };

  try {
    const code = await regenerateReferralCode(prisma, user.id);
    revalidatePath("/profile");
    return { code, error: null };
  } catch (err) {
    console.error(err);
    return { code: null, error: "regenerateFailed" };
  }
}
```

- [ ] **Step 4: Messages.**

en.json: add `"routines": "{count, plural, one {# routine} other {# routines}}"` and `"workouts": "{count, plural, one {# workout} other {# workouts}}"` to `common`. Add a `backup` object inside `settings`, and a new `profile` namespace:

```json
    "backup": {
      "export": "Export backup",
      "importMerge": "Import & merge",
      "importReplace": "Import & replace all",
      "help": "Export downloads all your exercises, routines, and workout history as a JSON file. Merge adds a backup's data to what you have now; replace wipes your current data first.",
      "imported": "Imported {parts}.",
      "nothingNew": "Nothing new to import — your data already matches this file.",
      "replaceTitle": "Replace all data?",
      "replaceDescription": "This permanently deletes all your current exercises, routines, and workout history, then restores everything from the file. This can't be undone.",
      "replaceConfirm": "Replace everything"
    }
```

```json
  "profile": {
    "title": "Profile",
    "username": "Username",
    "email": "Email",
    "memberSince": "Member since",
    "inviteFriends": "Invite friends",
    "inviteDescription": "Share this link so friends can create an account. It never expires and anyone with it can join.",
    "copied": "Copied",
    "copy": "Copy",
    "invited": "Invited <b>{count}</b> {count, plural, one {friend} other {friends}}",
    "linkLeaked": "Link leaked or shared too widely?",
    "regenerate": "Regenerate",
    "regenerateTitle": "Regenerate invite link?",
    "regenerateDescription": "Your current link will stop working immediately. Anyone you've already sent it to won't be able to sign up with it."
  }
```

th.json: add `"routines": "{count, plural, other {# โปรแกรม}}"` and `"workouts": "{count, plural, other {# การฝึก}}"` to `common`, then:

```json
    "backup": {
      "export": "ส่งออกข้อมูลสำรอง",
      "importMerge": "นำเข้าและรวมข้อมูล",
      "importReplace": "นำเข้าและแทนที่ทั้งหมด",
      "help": "ส่งออกจะดาวน์โหลดท่า โปรแกรม และประวัติการฝึกทั้งหมดเป็นไฟล์ JSON การรวมข้อมูลจะเพิ่มข้อมูลจากไฟล์สำรองเข้ากับข้อมูลปัจจุบัน ส่วนการแทนที่จะลบข้อมูลปัจจุบันทั้งหมดก่อน",
      "imported": "นำเข้าแล้ว: {parts}",
      "nothingNew": "ไม่มีข้อมูลใหม่ให้นำเข้า — ข้อมูลของคุณตรงกับไฟล์นี้อยู่แล้ว",
      "replaceTitle": "แทนที่ข้อมูลทั้งหมด?",
      "replaceDescription": "ระบบจะลบท่า โปรแกรม และประวัติการฝึกปัจจุบันทั้งหมดอย่างถาวร แล้วกู้คืนทุกอย่างจากไฟล์ ไม่สามารถย้อนกลับได้",
      "replaceConfirm": "แทนที่ทั้งหมด"
    }
```

```json
  "profile": {
    "title": "โปรไฟล์",
    "username": "ชื่อผู้ใช้",
    "email": "อีเมล",
    "memberSince": "เป็นสมาชิกตั้งแต่",
    "inviteFriends": "ชวนเพื่อน",
    "inviteDescription": "แชร์ลิงก์นี้ให้เพื่อนสร้างบัญชี ลิงก์ไม่มีวันหมดอายุ และใครมีลิงก์ก็สมัครได้",
    "copied": "คัดลอกแล้ว",
    "copy": "คัดลอก",
    "invited": "ชวนเพื่อนแล้ว <b>{count}</b> {count, plural, other {คน}}",
    "linkLeaked": "ลิงก์หลุดหรือถูกแชร์ออกไปกว้างเกินไป?",
    "regenerate": "สร้างใหม่",
    "regenerateTitle": "สร้างลิงก์เชิญใหม่?",
    "regenerateDescription": "ลิงก์ปัจจุบันจะใช้ไม่ได้ทันที คนที่คุณส่งลิงก์ไปแล้วจะสมัครด้วยลิงก์นั้นไม่ได้"
  }
```

Run: `npx vitest run i18n/messages.test.ts`. Expected: PASS.

- [ ] **Step 5: `profile/page.tsx`**

Delete `formatMemberSince`. Add `import { getFormatter, getTranslations } from "next-intl/server";`, and after the redirect guard `const [t, format] = await Promise.all([getTranslations("profile"), getFormatter()]);`.

| Old | New |
|---|---|
| `>Profile<` | `>{t("title")}<` |
| `>Username<` / `>Email<` / `Member since` | `{t("username")}` / `{t("email")}` / `{t("memberSince")}` |
| `{formatMemberSince(profile.createdAt)}` | `{format.dateTime(new Date(profile.createdAt), { year: "numeric", month: "long", day: "numeric" })}` |

- [ ] **Step 6: `ReferralCard.tsx`**

Add `const t = useTranslations("profile"); const te = useTranslations("errors");`.
- `setError("Couldn't copy — copy the link manually")` → `setError(te("copyLink"))`
- `setError(result.error ?? "Could not regenerate code")` → `setError(te(\`referral.${result.error ?? "regenerateFailed"}\`))`

| Old | New |
|---|---|
| `Invite friends` | `{t("inviteFriends")}` |
| the description `<p>` text | `{t("inviteDescription")}` |
| `{copied ? "Copied" : "Copy"}` | `{copied ? t("copied") : t("copy")}` |
| the `Invited … friend(s)` span | `<span>{t.rich("invited", { count: invitedCount, b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span> })}</span>` |
| `Link leaked or shared too widely?` | `{t("linkLeaked")}` |
| `Regenerate` (button) / `confirmLabel="Regenerate"` | `{t("regenerate")}` / `confirmLabel={t("regenerate")}` |
| `title="Regenerate invite link?"` / `description="Your current link…"` | `title={t("regenerateTitle")}` / `description={t("regenerateDescription")}` |

- [ ] **Step 7: `BackupCard.tsx`**

Replace `summaryLine` with a hook-friendly version inside the component, and add the translators:

```tsx
export function BackupCard() {
  const t = useTranslations("settings.backup");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const format = useFormatter();
  // …existing refs/state unchanged…

  function summaryLine(s: ImportSummary): string {
    const parts: string[] = [];
    if (s.exercises) parts.push(tc("exercises", { count: s.exercises }));
    if (s.routines) parts.push(tc("routines", { count: s.routines }));
    if (s.sessions) parts.push(tc("workouts", { count: s.sessions }));
    if (s.sets) parts.push(tc("sets", { count: s.sets }));
    return parts.length ? t("imported", { parts: format.list(parts) }) : t("nothingNew");
  }
```

(Delete the old top-level `summaryLine`, and import `useFormatter, useTranslations` from `next-intl`.)

- `handleExport` catch → `console.error(err); setError(te("exportBackup"));`
- `runImport`: `setError(result.error ?? "Could not import backup")` → `setError(te(\`backup.${result.error ?? "importFailed"}\`))`; the catch → `console.error(err); setError(te("backup.importFailed"));`
- `setError("That file isn't valid JSON.")` → `setError(te("invalidJson"))`

| Old | New |
|---|---|
| `Export backup` | `{t("export")}` |
| `Import &amp; merge` | `{t("importMerge")}` |
| `Import &amp; replace all` | `{t("importReplace")}` |
| the two-line help `<p>` text | `{t("help")}` |
| `title="Replace all data?"` / `description="This permanently…"` / `confirmLabel="Replace everything"` | `title={t("replaceTitle")}` / `description={t("replaceDescription")}` / `confirmLabel={t("replaceConfirm")}` |

If `tsc` rejects the template keys passed to `te(...)`, add `as const` inside the template (`` te(`backup.${code}` as const) ``).

- [ ] **Step 8: Gate, browser check, commit**

```bash
npx tsc --noEmit && npm run lint && npm test
DOTENV_CONFIG_PATH=.env.local npm run test:db
```

Expected: all pass (local Docker Postgres must be running).

In Thai:
- `/profile` shows "เป็นสมาชิกตั้งแต่ 15 กันยายน 2569" and the invite card.
- In `/settings`, export a backup, then import it with merge: "ไม่มีข้อมูลใหม่ให้นำเข้า…".
- Import a random `.json`: "ไฟล์นี้ไม่ใช่ไฟล์สำรองของ workout-tracker".
- Import a non-JSON file: "ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง".
- Open the replace dialog and cancel.

```bash
git add lib/backup lib/actions/backup.ts lib/actions/referrals.ts "app/(app)/profile" "app/(app)/settings/BackupCard.tsx" messages
git commit -m "feat(i18n): translate profile and backup; actions return error codes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Leftover-English sweep, docs, full QA

**Files:**
- Modify: `CLAUDE.md`, `README.md`, and any file the sweep flags

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Sweep for hardcoded English in UI files**

```bash
grep -rnE '>[^<>{}]*[A-Za-z]{3,}[^<>{}]*<|(aria-label|placeholder|title|label|description|confirmLabel|cancelLabel)="[^"]*[A-Za-z]{3,}' app components --include='*.tsx'
grep -rnE '"[A-Z][a-z]+( [a-z]+)+[.!?…]?"' app components --include='*.tsx' --include='*.ts'
```

Expected: only allowed hits remain. Those are `PR` / `kg` / `W` / `e1RM` markup, `className` noise, and non-UI strings (event names, storage keys, route paths). Translate anything else into the matching namespace (en + th), then re-run the gate.

- [ ] **Step 2: Add a CLAUDE.md gotcha** (append to the `## Gotchas` list)

```markdown
- **i18n is next-intl 4, cookie-based, Thai-first** (no `/th` URL prefixes). Locale = `NEXT_LOCALE` cookie (`i18n/config.ts`: `th` default, `en`), resolved in `i18n/request.ts`, switched by the `setLocale` server action (`LanguageControl` in Settings, `LanguageToggleButton` on landing/login). **No hardcoded UI strings**: every user-visible string (aria-labels and placeholders too) lives in `messages/en.json` + `messages/th.json` under a per-surface namespace. `global.d.ts` types keys from en.json (`tsc` catches typos), and `i18n/messages.test.ts` fails if th/en differ in keys or ICU arguments. Async server components use `getTranslations`/`getFormatter`/`getLocale` (`next-intl/server`); client and *sync* server components use the `use*` hooks. `lib/**` never imports next-intl: formatters take `locale` (`formatSessionDate(date, locale)` etc. use `Intl` on a UTC-built date; Thai = Buddhist Era) and callers pass translated words (`sessionDisplayName(s, t("freeformWorkout"))`). Muscle groups stay English in the DB, displayed with `muscleLabel(tm, group)`. Server actions return error **codes** (not English text) for anything the UI shows; client catch blocks show `te("<key>")` (prod redacts thrown messages). Zod messages that reach forms are `VALIDATION_KEYS`, rendered via `useValidationMessage()`. Pass years as strings to ICU (`{year}` would print "2,026").
```

- [ ] **Step 3: README note**

Add a short "Localization" section to `README.md` (place it after the setup/run sections):

```markdown
## Localization

The UI is Thai by default and can be switched to English (Settings → Appearance → Language, or the TH/EN toggle on the landing and login pages). Strings live in `messages/th.json` and `messages/en.json`. Add a key to **both**: `npm test` checks they stay in sync.
```

- [ ] **Step 4: Full verification**

```bash
npx tsc --noEmit && npm run lint && npm test
DOTENV_CONFIG_PATH=.env.local npm run test:db
```

Expected: all pass.

Browser QA (signed in with Google):
- **Fresh cookie** (clear `NEXT_LOCALE`): `<html lang="th">`, everything Thai.
- Walk landing → login → dashboard → start workout → log sets (warmup + working) → rest timer → finish → summary → history → routines (create, add via picker, reorder, target sets, delete) → exercises (filter, search "ขา", new exercise, detail chart) → profile → settings (backup export/import).
- Switch to English in Settings: every screen flips. Reload: it persists. Switch back.
- Console has no hydration warnings or missing-message errors (`MISSING_MESSAGE`, `ENVIRONMENT_FALLBACK`).
- `getComputedStyle(h1).fontFamily` includes IBM Plex Sans Thai. Thai tone marks are not clipped in headings, badges, chips or the bottom nav. Where clipping shows, loosen `leading-none`/`leading-tight` on that element only.
- 375px width (`resize_window` mobile): no horizontal overflow from longer Thai labels. Then `resize_window` preset `desktop`.
- Dark mode in both languages.
- Screenshot the dashboard and the logging screen in Thai and English as proof.

- [ ] **Step 5: Commit**

```bash
git add -A ':!CLAUDE.md' ':!components/ui/Sheet.tsx'
git add CLAUDE.md README.md
git commit -m "docs(i18n): document localization; sweep leftover English

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Note: before this branch existed, the working tree already had unrelated uncommitted changes in `CLAUDE.md` and `components/ui/Sheet.tsx`. Ask the user how to handle them before committing `CLAUDE.md` (commit them separately, or stash). Never fold them into an i18n commit silently.
