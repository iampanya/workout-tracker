# UI Refresh, Editable Sets, and Muscle Group Dropdown — Design

## Context

The core app (routines, logging, exercises, history, progress) is already built and working, but it's still scaffold-quality visually: plain unstyled buttons, a free-text muscle group field, and no way to fix a mistyped set once it's logged. The user requested four related changes, treated here as one cohesive design (a single "polish pass") rather than separate specs, since they all touch the same screens and share one visual system:

1. Edit or delete a set that's already been logged.
2. Turn the muscle group field into a dropdown with sensible initial values.
3. Replace text buttons with appropriate icons across the app.
4. A general frontend redesign — better-looking, easier to use.

Requirements gathered interactively:
- Edit/delete applies only to sets on the **active, in-progress logging screen** (`/log/[sessionId]`). History (`/history/[sessionId]`) stays read-only — out of scope.
- Muscle group becomes a **closed dropdown**: Chest, Back, Legs, Shoulders, Arms, Core (the 5 groups already used by preset exercises, plus Core).
- Icon library: **lucide-react**.
- Visual direction: supports both light and dark (follows OS `prefers-color-scheme`, as the app already does), **bold/energetic mood**, **lime/electric-green accent**.
- Icon-only buttons for frequent/secondary actions (edit, delete, reorder, archive, discard, logout); icon + label for primary actions (Start Workout, Add Set, Finish, Add).

## Design System

### Color tokens (`app/globals.css`)

Expand the existing two CSS variables into a full token set, each with a light and dark value (light in `:root`, dark in the existing `@media (prefers-color-scheme: dark)` block):

- `--background`, `--foreground` (existing)
- `--surface` — card/panel background, distinct from page background
- `--border` — replaces ad-hoc `border-gray-*` classes
- `--muted` — secondary text (replaces scattered `text-gray-500`)
- `--accent`, `--accent-foreground` — lime/electric green, used for primary buttons, active nav state, PR badge
- `--danger`, `--danger-foreground` — red, used for delete/discard actions and error text
- `--warning` — amber, kept for the PR banner background

All wired into `@theme inline` as `--color-*` so Tailwind utility classes (`bg-surface`, `text-muted`, `border-border`, etc.) work directly, replacing hardcoded `bg-white`, `text-gray-500`, `bg-black` throughout.

### Font fix

`body` in `globals.css` currently hardcodes `font-family: Arial, Helvetica, sans-serif`, silently overriding the Geist font already loaded in `app/layout.tsx` via `--font-geist-sans`. Fix `body` to use `var(--font-sans)` so the intended font actually renders.

### Shared UI primitives (new `components/ui/`)

- **`Button`** — variants `primary` (accent-filled, for main CTAs), `secondary` (bordered), `ghost` (text-only), `danger` (red, for destructive text+icon actions like Discard). Supports a `loading` prop that swaps the label for a spinning `Loader2` icon without changing button size.
- **`IconButton`** — icon-only button; `aria-label` is a required prop (lucide-react icons carry no accessible name on their own).
- **`Card`** — the `rounded border p-4` pattern currently copy-pasted across pages, using the new `--surface`/`--border` tokens.

These three are the full extent of the new component layer — no form-abstraction library, no `clsx`/`tailwind-merge` dependency; plain template-literal class composition is enough at this app's size.

### Bottom navigation

`app/(app)/layout.tsx`'s nav becomes a new client component `BottomNav.tsx` (needs `usePathname` for active-state highlighting, so it must leave the server-component layout). Each link gets a lucide icon + small label, with the active route highlighted using `--accent`.

## Feature: Edit / Delete Logged Sets

### Backend

- `deleteSetForUser` and the `deleteSet` server action already exist ([lib/sessions/service.ts:172](lib/sessions/service.ts), [lib/actions/sessions.ts:42](lib/actions/sessions.ts)) but are unused by any UI — wire them up.
- Add `updateSetSchema` to `lib/validation.ts`: `{ weightKg, reps, isWarmup }`, same constraints as `logSetSchema` minus `sessionExerciseId`.
- Add `updateSetForUser(supabase, userId, setId, input)` to `lib/sessions/service.ts`, following the existing pattern: parse input, verify ownership via `.eq("user_id", userId)`, fetch `exercise_id` for the set, compute `priorMax` via `getPriorMaxWeight` *before* applying the update (same ordering `logSetForUser` uses), apply the update, return `{ set, isPr }` — so editing a set up to a new record still surfaces the PR banner, and editing down/removing warmup status behaves consistently with the live-computed-PR model already in place.
- Add `updateSet` action to `lib/actions/sessions.ts` mirroring `logSet`'s shape.

### UI (`LoggingClient.tsx`)

Each set row gains local edit-mode state:
- **Display mode**: `weight × reps` + warmup badge (if any) + `IconButton` pair (`Pencil`, `Trash2`) at the row end.
- **Edit mode** (entered by tapping the pencil icon): the row's text is replaced by weight/reps inputs and a warmup toggle, with confirm (`Check`) / cancel (`X`) icon buttons. Confirming calls the new `updateSet` mutation using the same TanStack Query optimistic-update / error-rollback pattern already used for adding sets.
- **Delete**: tapping `Trash2` swaps that icon to a `Check` (confirm) / `X` (cancel) pair in place, rather than using `window.confirm` — a second tap on `Check` calls `deleteSet` and removes the row from local state; tapping `X` or elsewhere reverts to the plain `Trash2` icon.

## Feature: Muscle Group Dropdown

### Database

New migration `supabase/migrations/0002_muscle_group_enum.sql` adds `CHECK (muscle_group IN ('Chest','Back','Legs','Shoulders','Arms','Core'))` to `exercises.muscle_group`. The column stays `text` (a Postgres enum type is unnecessary ceremony for 6 fixed values). All existing preset rows already satisfy this constraint — no backfill needed.

### Validation

`lib/validation.ts`: `createExerciseSchema.muscleGroup` changes from free-text `z.string().optional()` to `z.enum(["Chest","Back","Legs","Shoulders","Arms","Core"])` — required, since a dropdown always has a selected value.

### UI

- `AddExerciseForm.tsx`: the muscle group text input becomes a native `<select>` styled to match the new theme, defaulting to "Chest".
- `exercises/page.tsx`: muscle group renders as a small colored pill/badge (one accent tint per group) instead of plain gray text, consistent with the bold visual direction.

## Icon Mapping

| Location | Before | After |
|---|---|---|
| Bottom nav | text links | `LayoutDashboard`, `ClipboardList`, `Dumbbell`, `History`, `LogOut` + label |
| Dashboard: Start a Workout | text button | `Play` + text (primary) |
| Discard session (dashboard) | "Discard" text | `Trash2` icon-only |
| Routine editor: reorder | "↑" / "↓" | `ChevronUp` / `ChevronDown` icon-only |
| Routine editor: remove exercise | "Remove" text | `X` icon-only |
| Routines list: delete routine | text button | `Trash2` icon-only |
| Routines list: create routine | text button | `Plus` + text |
| Exercises: archive | "Archive" text | `Archive` icon-only |
| Exercises: add custom | "Add" text | `Plus` + text |
| Logging: Add Set | "Add Set" text | `Plus` + text |
| Logging: Finish Workout | text button | `CheckCircle2` + text (primary) |
| Logging: Discard | text button | `Trash2` + text (danger) |
| Logging: edit/delete set (new) | — | `Pencil` / `Trash2` icon-only |
| PR badge | 🏆 emoji | `Trophy` icon (theme-colorable SVG) |
| Logout | text button | `LogOut` icon-only, in nav |

## Edge Cases

- Every icon-only button requires an explicit `aria-label` — lucide icons carry no accessible name by default.
- Existing textual pending states ("Archiving...", "Discarding...") become a spinning `Loader2` icon inside the same button, so the button doesn't resize on click.
- Editing a set recomputes `isPr` the same way logging does; deleting a set needs no PR fix-up since PRs are always live `MAX()` queries (per the original design's existing invariant).
- The muscle group `CHECK` constraint only applies to future writes; since no existing data violates it, the migration is a plain additive change with no data migration step.
- Error messaging keeps its current red styling, now sourced from `--danger` instead of a hardcoded Tailwind color.

## Non-Goals

No swipe gestures, no drag-and-drop reordering, no editing/deleting sets from History, no custom Postgres enum type, no new form/state-management libraries, no changes to the routines/sessions/exercises data model beyond the muscle group constraint.

## Verification

- `npm run lint` and `npm test` pass.
- Manual walkthrough via `npm run dev` on both a 375px mobile viewport and desktop, in both light and dark OS modes: start a session, log a set, edit it to a new PR weight (banner appears), delete a set, add a custom exercise via the new dropdown, confirm the DB constraint doesn't reject valid values.
- Spot-check every icon-only button has a visible `aria-label` via the accessibility tree.
