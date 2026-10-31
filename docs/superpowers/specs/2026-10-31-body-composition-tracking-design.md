# Body composition tracking (arboleaf)

## Context

The user weighs on an arboleaf smart scale (8-electrode, segmental). arboleaf exports one **image-only PDF
per measurement** (Skia render, no text layer; at least two different layouts seen — 2-page and 3-page —
same values). They want to track body-composition progress inside the workout tracker: trend charts,
multi-metric goals, a link to training (dashboard card + muscle balance vs trained muscle groups), and a
stored full report per scan.

Decisions made in brainstorming:
- **Ingestion = "manual via Claude Code"**: Claude Code reads the PDF and emits a versioned JSON; the user
  pastes/uploads that JSON on the `/body` page (works on prod, no prod DB credentials locally). In-app PDF
  upload via Claude API is a later phase that reuses the same preview/confirm flow.
- Re-importing a scan with the same `measured_at` **replaces** the stored one (lets the user fix misreads).
- Goals: up to 3 target values, no deadline; "use arboleaf's suggestion" button.
- New 5th bottom-nav tab "Body".

## 1. Data model (Prisma migration `body_scans`, expand-only)

`body_scans` (one row per measurement)
- `id uuid pk`, `user_id uuid fk → users (on delete cascade)`, `created_at timestamptz`
- `measured_at timestamptz` — scan time from the report (Bangkok local → stored UTC). `unique(user_id, measured_at)`.
- `source text default 'arboleaf'`
- Core numeric columns (all nullable except `weight_kg`): `weight_kg`, `bmi`, `body_fat_pct`, `body_fat_kg`,
  `skeletal_muscle_kg`, `skeletal_muscle_pct`, `muscle_mass_pct`, `soft_lean_mass_kg`, `fat_free_mass_kg`,
  `body_water_l`, `body_water_pct`, `protein_kg`, `protein_pct`, `bone_mass_kg`, `bone_mass_pct`,
  `visceral_fat`, `subcutaneous_fat_pct`, `subcutaneous_fat_kg`, `bmr_kcal`, `smi`, `waist_hip_ratio`,
  `fitness_score`, `height_cm`, `age`
- `segments jsonb` — `{ leftArm, rightArm, trunk, leftLeg, rightLeg }`, each
  `{ leanKg, leanPct, leanEval, fatKg, fatPct, fatEval, muscleRatioPct, fatRatioPct }` (nullable fields)
- `report jsonb` — everything else for the historical report: `ranges` (per metric `[min,max]`),
  `evaluations` (nutrition / fat / body balance / body strength checkboxes), `weightControl`
  `{ normalWeightKg, weightKg, fatKg, muscleKg }`, `advice` (text)

`body_goals`
- `id`, `user_id`, `metric text` (`weight_kg` | `body_fat_pct` | `body_fat_kg` | `skeletal_muscle_kg`),
  `target numeric`, `start_value numeric` (latest scan value when set), `created_at`; `unique(user_id, metric)`.
- At most one fat goal (pct **or** kg) — enforced in the service.

Prisma `Decimal` → `Number()` at the service boundary (same as `toSetRow`).

## 2. Import format + flow

JSON (`lib/body/schema.ts`, zod, single source; `version` gate like backup):
```json
{ "version": 1, "source": "arboleaf",
  "scans": [{ "measuredAt": "2026-10-18T09:58:00+07:00", "weightKg": 74.15, "bmi": 23.4,
    "bodyFatPct": 23.2, "bodyFatKg": 17.2, "skeletalMuscleKg": 32.11, "visceralFat": 7, "…": "…",
    "segments": { "leftArm": { "leanKg": 3.1, "leanPct": 94.4, "fatKg": 0.89, "fatPct": 141.8 }, "…": {} },
    "report": { "ranges": {}, "evaluations": {}, "weightControl": {}, "advice": "…" } }] }
```
- `measuredAt` must carry an offset (reject naive timestamps).
- Project skill `.claude/skills/arboleaf-to-json/SKILL.md`: how to read either arboleaf layout, field
  mapping, the schema, a full example built from the 18/10/2026 scan, and "write to `body-scans/*.json`
  (gitignored), never commit".
- UI: `/body` → "Import scan" → `Sheet` with textarea + `.json` file picker → parse/validate client-side →
  preview (date, core values, "replaces existing" marker) → confirm → server action `importBodyScans`
  (re-validates with the same zod schema) → `lib/body/service.ts::importBodyScansForUser` upserts by
  `(user_id, measured_at)` in one transaction → `revalidatePath('/body')`, `/dashboard`.
- Errors return codes (`invalidJson`, `invalidSchema`, `unsupportedVersion`) translated in the UI.

## 3. `/body` page and goals

- Nav: 5th `NAV_ITEMS` entry `{ href: "/body", labelKey: "body", icon: PersonSimple }`.
- Sections: (1) latest snapshot — 4 `StatCard`s (weight, %fat, skeletal muscle, visceral fat) with delta vs
  previous scan, colored by "good direction"; (2) goals — progress bars + edit `Sheet` with "use arboleaf
  suggestion" (from latest `report.weightControl`); (3) trend line chart (recharts, chip toggle
  weight / %fat / fat kg / skeletal muscle, dashed goal line); (4) balance card (section 4);
  (5) scan history list → `/body/[scanId]`.
- `/body/[scanId]`: full report — values + ranges + evaluation `Badge`s, segment table, advice; delete via
  `ConfirmDialog`.
- Pure helpers `lib/body/metrics.ts`: `scanDelta`, `goodDirection(metric)`, `goalProgress(start, target,
  current)` (clamped 0–100), `toScanDateString(measuredAt)` (in `TIME_ZONE`, formatted server-side).
- Empty state (`EmptyState`) with the import CTA when no scans.

## 4. Training link

- Dashboard "Body" card after the overview stats: latest weight/%fat/skeletal muscle + delta, mini goal
  bars, "last scan N days ago"; hidden when the user has no scans. Data from
  `getLatestBodySummary(db, userId)`.
- Balance card on `/body`:
  - Left vs right: arm and leg lean kg from the latest scan, % difference, report evaluation badge.
  - Upper/trunk/lower: lean-mass share (arms / trunk / legs) vs working-set share over the last 4 weeks
    (Arms → arms; Chest/Back/Shoulders/Core → trunk; Legs → legs). Pure mapping + aggregation in
    `lib/body/balance.ts`; set counts via a service query filtered by `user_id`, working sets only.
  - No auto-advice; sets aren't sided, so L/R is informational only.

## 5. Conventions to honor

- Service functions `(db, userId, …)`, every query filters `user_id`; no `lib/session` import in services.
- i18n: new `body` namespace in `messages/en.json` + `th.json` (and `nav.body`, dashboard card keys); no
  hardcoded strings; dates formatted on the server.
- Icons from `@phosphor-icons/react/ssr`; reuse `Card`, `StatCard`, `Badge`, `Sheet`, `ConfirmDialog`,
  `EmptyState`, `ButtonLink`.
- Migration is additive only (safe under expand/contract).

## 6. Testing

- Pure (`npm test`, add to the list **and** exclude in `test:db`): `lib/body/schema.test.ts` (both sample
  scans parse; bad version/naive date rejected), `lib/body/metrics.test.ts`, `lib/body/balance.test.ts`.
- DB (`test:db`): `lib/body/service.test.ts` — import upsert replaces same `measured_at`; list/latest/delete;
  goals set/replace + single fat goal; **cross-user isolation** for every read/write/delete.
- Manual QA in the browser (Google sign-in): import the 18/10/2026 JSON, preview, re-import replaces,
  chart/goal/balance render in th + en, light + dark, mobile width; dashboard card appears only with scans.

## Out of scope (follow-ups)

In-app PDF upload with Claude API extraction; body scans/goals in backup export/import (`import_backup`
SQL change); strength-to-bodyweight on exercise pages; other scale brands.

