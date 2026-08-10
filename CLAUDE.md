@AGENTS.md

## Commands

```bash
npm run dev                                          # dev server
npm test                                              # pure-function unit tests, no DB needed
DOTENV_CONFIG_PATH=.env.local npm run test:db         # DB-backed integration tests (needs `supabase start` running)
npx tsc --noEmit && npm run lint                      # typecheck + lint
```

Full local setup (Supabase CLI, `.env.local`, creating the one user account) and deployment steps are in `README.md` — read it before first-time setup.

## Architecture

- `app/(app)/**/page.tsx` — server components; fetch via the Supabase server client, pass data to client components.
- `lib/actions/*.ts` — thin `"use server"` wrappers: resolve `userId`, call a `lib/<domain>/service.ts` function, `revalidatePath`.
- `lib/<domain>/service.ts` — the actual business logic, as plain functions taking `(supabase, userId, ...args)`. Call these directly in tests — no mocking needed, since DB-backed tests (`lib/**/*.test.ts`, run via `test:db`) hit a real local Supabase instance via `lib/supabase/test-helpers.ts`.
- `components/ui/{Button,Card,IconButton}.tsx` — the design-system primitives; reuse these rather than raw Tailwind for new screens.
- No component-level (`.tsx`) test harness exists. UI behavior is verified manually in the browser, not with automated component tests.

## Gotchas

- This is a **single-user app**: public signup is disabled by design (both local and hosted), and there is no signup page — don't add one. See `README.md` for how to create the one account.
- RLS is not automatically enough on its own: `session_exercises`' RLS policy only checks the *inserted* row's own `user_id`, not that the referenced `session_id` actually belongs to that user. Service functions that insert child rows under a parent the caller doesn't own need an explicit ownership check first (see `addExerciseToSessionForUser` in `lib/sessions/service.ts`).
- `exercise_prs` is a live Postgres view (`max(weight_kg)` per user+exercise, excluding warmup sets), not a cached table — never denormalize/cache its value. It requires `security_invoker = true` to run under the querying role's RLS instead of the view owner's (superuser) privileges — see the comment in `supabase/migrations/0001_init.sql`.
- Set numbering uses `max(set_number) + 1`, never `count(*) + 1` — deleting a set from the middle leaves a gap, and `count(*)` would recompute a number that collides with the `unique(session_exercise_id, set_number)` constraint.
- All weights are stored and displayed in kilograms — no unit conversion anywhere in the app.
