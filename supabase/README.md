# `supabase/` — archived legacy (no longer used)

This directory is kept for **historical reference only**. Nothing here is applied anymore.

- **Schema source of truth is now Prisma Migrate** (`prisma/migrations/`), for **both** local and
  production. Production was baselined onto it on 2026-09-15 — see
  [`docs/adr/0001-local-db-on-docker-postgres.md`](../docs/adr/0001-local-db-on-docker-postgres.md) and
  [`docs/baseline-prod-to-prisma-migrate.md`](../docs/baseline-prod-to-prisma-migrate.md).
- `migrations/0001–0010` are the old GoTrue/Supabase-coupled chain (depend on the `auth` schema,
  Supabase roles, RLS, `auth.uid()`) — they will **not** run on a plain Postgres. **Do not add to them.**
- `config.toml` configured the Supabase CLI local stack, which local dev no longer uses (`supabase stop`).
- `seed.sql` is the one live file: it's still the single source of the preset exercises, executed by
  `prisma/seed.mjs` during `prisma migrate reset` / `prisma db seed`. Leave it here.

**Change the schema:** `prisma migrate dev --name <x>` (local) → `DIRECT_URL=<prod> npx prisma migrate deploy` (prod).
