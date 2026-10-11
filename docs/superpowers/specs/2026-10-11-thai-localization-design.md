# Thai / English localization (next-intl)

## Problem

The whole UI is hardcoded English: ~72 `.tsx` files, plus `lib/` formatters that emit
English words (dates, set counts, durations, "Freeform Workout", picker "Recent"/"Other",
"No exercises yet"). The app's users are Thai, and the main font (Fira Sans) has no Thai glyphs.

## Goals

1. Thai is the default UI language; a user can switch to English and the choice persists per device.
2. Every user-visible string (including `aria-label`, `title`, placeholders, and error fallbacks) comes from a message file.
3. A missing or misspelled translation key fails `tsc` / `npm test`, not production.
4. Dates and numbers format per locale. Thai dates use the Buddhist Era (e.g. "11 ต.ค. 2569").
5. Thai text renders in a proper Thai font without changing how Latin text and digits look.

## Non-goals

- Locale in the URL (`/th/...`), SEO hreflang, or per-account (DB-stored) language preference.
- Translating user content (routine/exercise/session names, notes) or the 15 preset exercise names.
- Translating internal server error strings that production redacts anyway (see Errors).
- Unit conversion (everything stays kg).

## Decisions

| Decision | Choice |
|---|---|
| Languages | Thai + English, user-switchable |
| Default | Thai when no preference cookie exists |
| Library | `next-intl` 4.x (4.14.9 peer-supports Next 16 / React 19), **without i18n routing** |
| Preset exercise names | Stay English (DB untouched); muscle groups are translated at display time |
| Thai dates | Buddhist Era (the `th` Intl default) |
| Vocabulary | Mixed: the most natural term per word (see Glossary) |
| Thai font | IBM Plex Sans Thai as the Thai-glyph fallback behind Fira Sans |

## Design

### 1. Locale plumbing (cookie-based)

- Add the `next-intl` dependency and wrap `next.config.ts` with `createNextIntlPlugin()`.
- `i18n/config.ts` is a plain module that both server and client can import. It exports `LOCALES = ["th", "en"] as const`, `type Locale`, `DEFAULT_LOCALE = "th"`, `LOCALE_COOKIE = "NEXT_LOCALE"`, and `isLocale(x)`.
- `i18n/request.ts`: `getRequestConfig` reads the cookie with `cookies()`, falls back to `DEFAULT_LOCALE` when the value is missing or invalid, and loads `messages/${locale}.json`.
- `app/layout.tsx`: renders `<html lang={locale}>` and wraps children in `<NextIntlClientProvider>` (v4 passes messages and locale through automatically). Static `metadata` becomes `generateMetadata` using `getTranslations("meta")`.
- `global.d.ts` augments next-intl's `AppConfig` with `Locale` and `Messages: typeof import("./messages/en.json")`, so a wrong key fails `tsc`.
- Switching: the `setLocale(locale)` server action (`lib/actions/locale.ts`) validates the value with `isLocale` and sets the cookie (1 year, `sameSite: "lax"`, `path: "/"`). The client then calls `router.refresh()`. The preference has no DB column; it is per device, like theme and accent.
- `proxy.ts` / `PUBLIC_ROUTES` stay unchanged. Reading the cookie makes pages dynamic, but they already are because of auth.

### 2. Language switcher UI

- `components/theme/LanguageControl.tsx` is a segmented control "ไทย / English" matching `ThemeModeControl` / `AccentControl`. It sits on the Settings page next to the theme controls.
- A compact TH/EN toggle (`components/theme/LanguageToggleButton.tsx`) sits in `LandingNav` and on `/login`, so logged-out visitors can switch too.

### 3. Messages

- `messages/en.json` and `messages/th.json` hold the strings, with one namespace per surface: `meta, common, nav, landing, login, dashboard, log, history, routines, exercises, profile, settings, muscle, picker, validation, errors, units`.
- English plurals use ICU, e.g. `"setCount": "{working, plural, one {# set} other {# sets}}{warmups, plural, =0 {} other { + #W}}"`. Thai uses the same keys and arguments without plural variants (`"{working} เซ็ต{warmups, plural, =0 {} other { + #W}}"`).
- Not translated: user content, preset exercise names, the unit `kg`, the `W` warmup marker, `PR`, the backup JSON format, and server-thrown error text.
- `i18n/messages.test.ts` (pure) asserts that both files have identical key sets and identical ICU argument names per key. Add it to `npm test` **and** exclude it in `test:db`.

### 4. Pure `lib/` formatters become locale-aware

The formatters stay pure and never import next-intl. Callers pass `locale` and any translated words.

- `lib/sessions/summary.ts`:
  - `formatSessionDate(dateStr, locale)`, `formatShortDate(dateStr, locale)`, and `formatMonthHeading(dateStr, locale)` replace the hand-written `MONTHS` / `WEEKDAYS` / `MONTH_NAMES` tables with `Intl.DateTimeFormat(locale, { timeZone: "UTC", ... })` applied to `new Date(Date.UTC(y, m-1, d))`. This keeps the "never UTC-shift a calendar date" rule. English output must stay byte-identical to today's, so existing tests pass with `"en"`.
  - `formatRelativeDate(dateStr, today, locale, labels: { today: string; yesterday: string })`.
  - `formatSetCount` becomes `countSets(sets) => { working, warmups }`, rendered with the ICU `common.setCount` message.
  - `formatDuration` becomes `splitDuration(minutes) => { hours, minutes }`, rendered via `units.durationMinutes` / `units.durationHours` ("45 min" / "1h 15m"; "45 นาที" / "1 ชม. 15 นาที").
- `lib/sessions/history.ts`: `sessionDisplayName(session, freeformLabel)`, with the caller passing `t("common.freeformWorkout")`.
- `lib/exercises/picker.ts`: sections keep stable `key`s (`"recent"`, `"group:<Group>"`, `"group:Other"`) and drop English `label`s. `ExercisePicker` maps them to `picker.recent`, `picker.other`, and `muscle.<Group>`.
- `lib/routines/preview.ts` returns `null` when the routine has no exercises. The caller renders `routines.noExercisesYet`.
- Muscle groups: `MUSCLE_GROUPS` values stay English (they are stored keys). They are displayed via `t(\`muscle.${group}\`)` in badges, the picker, exercise forms, and `Select` options.
- Numbers: bare `toLocaleString()` depends on the runtime locale and can mismatch between server and client. Replace it with next-intl `format.number(...)` (`useFormatter` / `getFormatter`). `profile/page.tsx`'s `toLocaleDateString("en-US")` becomes `format.dateTime`. `BackupCard`'s `"en-CA"` stays, because it builds a filename.
- Tests: update `summary.test.ts`, `picker.test.ts`, and `preview.test.ts`, and add `th` cases, e.g. `formatSessionDate("2026-08-11", "th")` returns `"11 ส.ค. 2569"`.

### 5. Errors

- Production Next redacts messages thrown from server actions, so users already see the client fallback strings ("Failed to start workout", …). Those fallbacks are translated, and server `throw new Error(...)` text stays English (logs/dev only).
- Errors that actions *return* reach users in prod, so they become codes:
  - `importBackup` returns `error: "invalidFile" | "unsupportedVersion" | "importFailed" | null`, rendered via `errors.backup.*`.
  - `regenerateReferralCode` returns `error: "notAuthenticated" | "regenerateFailed" | null`, rendered via `errors.referral.*`.
- Zod messages in `lib/validation.ts` that surface through `react-hook-form` (`CreateRoutineForm`, `AddExerciseForm`) become message keys (`"nameRequired"`, `"notesTooLong"`, …), rendered as `t(\`validation.${message}\`)`.
- Finish-workout guard: the client-side `ConfirmDialog` alert (what users see) uses translated text. The server guard stays English as the source of truth.

### 6. Typography

- `app/layout.tsx` adds `IBM_Plex_Sans_Thai({ subsets: ["thai"], weight: ["400","500","600","700"], variable: "--font-thai" })`.
- `app/globals.css` sets `--font-sans: var(--font-fira-sans), var(--font-thai);`. Latin letters and digits stay Fira Sans, and Thai glyphs fall through to IBM Plex Sans Thai.
- Thai tone marks can clip under tight leading. Check `leading-none` / `leading-tight` text and chips during QA, and loosen leading only where clipping is visible.

## Glossary (Thai, mixed style)

| English | Thai |
|---|---|
| Dashboard | หน้าหลัก |
| Routines | โปรแกรม |
| Exercises | ท่าออกกำลังกาย |
| History | ประวัติ |
| Settings / Profile | ตั้งค่า / โปรไฟล์ |
| Workout | การฝึก (Start เริ่มฝึก · Finish จบการฝึก · Discard ยกเลิกการฝึก) |
| Freeform Workout | ฝึกอิสระ |
| Set / Reps | เซ็ต / ครั้ง |
| Warmup | วอร์มอัพ (marker stays `W`) |
| Volume | ปริมาณรวม |
| PR | PR |
| Streak | ต่อเนื่อง |
| Rest timer | จับเวลาพัก |
| Today / Yesterday | วันนี้ / เมื่อวาน |
| Recent / Other | ล่าสุด / อื่นๆ |
| Chest · Back · Legs · Shoulders · Arms · Core | อก · หลัง · ขา · ไหล่ · แขน · แกนกลางลำตัว |

## Implementation phases (one commit each)

1. **Infrastructure:** dependency, config/request/types, layout provider + `lang` + metadata, Thai font, `setLocale`, the switchers, complete message files for the shell, parity test. After installing, kill `next dev` and `rm -rf .next`.
2. **Pure lib refactor** (§4), test-first.
3. **Translate surfaces**, batch by batch: app shell (`TopBar`, `BottomNav`, `nav-items.ts` gets `labelKey`, `AccountMenu`, `LogoutButton`, `components/ui/*` defaults) → landing + login → dashboard → log (`LoggingClient`, rest timer, `useStartSession`) → history + summary → routines → exercises → profile → settings/backup.
4. **Errors and validation** (§5).
5. **Docs:** a CLAUDE.md gotcha (where messages live, the parity test, no hardcoded UI strings, lib formatters take `locale`) and a README note.

## Testing

- `npx tsc --noEmit && npm run lint`: the typed `Messages` catches missing keys.
- `npm test`: the parity test, plus formatter tests (en unchanged; th uses the Buddhist Era).
- `DOTENV_CONFIG_PATH=.env.local npm run test:db`: the backup/referral error-code changes.
- Browser QA, signed in with Google:
  - A fresh cookie defaults to Thai with `<html lang="th">`.
  - Walk every page (landing, login, dashboard, start → log → rest timer → finish → summary, history, routines, exercises + picker, profile, settings).
  - Switch to English, confirm it persists across reload, then switch back.
  - No hydration warnings, Thai glyphs render in IBM Plex Sans Thai, no clipped tone marks, no overflow at 375px width, and dark mode looks right.
