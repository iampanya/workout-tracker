# ADR 0001 — Local dev DB ย้ายจาก Supabase CLI → Docker Postgres + Prisma Migrate

- **สถานะ:** Accepted
- **วันที่:** 2026-09-13 (ปรับปรุง 2026-09-15: baseline production ขึ้น Prisma Migrate แล้ว)
- **ขอบเขต:** เริ่มที่ local development; ต่อมา production ถูก baseline ขึ้น Prisma Migrate ด้วย (ดู Follow-ups)

## Context

หลังย้าย auth ไป **Auth.js** และ data layer ไป **Prisma (ต่อ Postgres ตรง)** แอปไม่ได้ใช้ Supabase
Auth/PostgREST อีกเลย — Supabase เหลือบทบาทแค่ "ที่ host Postgres" ทั้งบน prod และ local

Local dev ยังพึ่ง **Supabase CLI** (`supabase start` เปิด 4 container: db/rest/gotrue/kong; `supabase db reset`
รัน `supabase/migrations/*.sql` + `seed.sql`) ทั้งที่ต้องการแค่ Postgres หนึ่งตัว นักพัฒนามี **Postgres 18
ใน Docker** ที่รันหลายโปรเจกต์อยู่แล้ว (แต่ละแอปมี db+role ของตัวเอง) จึงอยากเลิกพึ่ง Supabase CLI สำหรับ dev

**ปัญหาเชิงเทคนิค:** `supabase/migrations/0001–0010` รันบน **vanilla Postgres ไม่ได้** เพราะพึ่งของที่ Supabase
provision ให้ — `auth.users` (สร้างโดย GoTrue), role `authenticated`/`service_role`/`anon`, ฟังก์ชัน `auth.uid()`,
และ RLS policies (ถึง 0010 จะปิด RLS ทีหลัง แต่ policy ถูก *สร้าง* ไว้ตั้งแต่ 0001–0004 โดยอ้าง `auth.uid()`)

## Decision

1. **Local dev ต่อ Postgres ใน Docker โดยตรง** — สร้าง database `workout_tracker_dev` + login role
   `workout_tracker` (owner, `CREATEDB` เผื่อ shadow DB ของ `prisma migrate dev`) ตามคอนเวนชันเดิมของ
   นักพัฒนา (`food_tracker_dev`, `porttracker_dev`, …) เลิกใช้ `supabase start` สำหรับ dev
2. **ใช้ Prisma Migrate เป็นกลไก schema ของ local** — ยุบ end-state ปัจจุบัน (post-0010) เป็น baseline เดียว
   `prisma/migrations/0001_init/migration.sql` ที่เป็น **vanilla-PG ล้วน**:
   - สร้างจาก `pg_dump --schema=public --no-owner --no-privileges` ของ DB Supabase local (มี 0001–0010 ครบ)
     แล้ว sanitize ออก: RLS policies ทั้งหมด, `referral_count()` (ไม่ถูกใช้), `import_backup(jsonb,text)`
     overload เก่าที่พึ่ง `auth.uid()`, `CREATE SCHEMA public`, และบรรทัด `set_config('search_path','')`
   - **ไม่ต้องมี** `create extension pgcrypto` เพราะ Postgres 13+ มี `gen_random_uuid()` ใน core
     (เลี่ยงปัญหา non-superuser สร้าง extension)
   - คงไว้: ตาราง (FK ชี้ `public.users`), view `exercise_prs`, ฟังก์ชัน `gen_referral_code`/`handle_new_user`/
     `import_backup(jsonb,text,uuid)`, trigger `on_public_user_created`
3. **Seed** — `prisma/seed.mjs` อ่านและรัน `supabase/seed.sql` เดิม (single source ของ preset list) wire ผ่าน
   `migrations.seed` ใน `prisma.config.ts`; `npm run db:reset` = `prisma migrate reset` + `prisma db seed`
   (Prisma 7 ไม่ auto-seed ตอน reset)
4. **Production เลื่อนไว้ก่อน** — prod ยังเป็น Supabase-hosted + `supabase db push` ชุด `supabase/migrations/`
   ถูกเก็บไว้เป็น legacy/safety-net baseline ทั้งสองฝั่งอธิบาย end-state เดียวกัน ณ ตอนนี้

## Alternatives considered

- **Bootstrap shim** (สร้าง `auth` schema / stub `auth.uid()` / roles เปล่า แล้วรัน chain 0001–0010 บน vanilla PG):
  คง source of truth เดียวกับ prod แต่ลาก Supabase-ism ที่อยากทิ้งเข้ามา และ shim เปราะ — **ปฏิเสธ**
- **`db/schema.sql` + psql สำหรับ local เท่านั้น** (ไม่ใช้ Prisma Migrate): เรียบง่ายแต่ไม่มี migration history
  และ workflow ต่างจากสาย Prisma ของโปรเจกต์ — **ปฏิเสธ**
- **`supabase/postgres` image:** ยังพึ่ง Supabase และไม่มี `auth.users` (GoTrue สร้าง) อยู่ดี — **ปฏิเสธ**

## Consequences

- ✅ Local dev ไม่ต้องเปิด `supabase start` อีก — เบาลง, ใช้ Postgres ที่มีอยู่, portable ไป Postgres เจ้าไหนก็ได้
- ✅ Baseline สะอาด (ไม่มี auth/role/RLS) สะท้อนสิ่งที่ runtime ใช้จริง (Prisma + isolation ที่ service layer)
- ✅ **Prisma Migrate เป็น single source ทั้ง local + prod** (baseline prod เสร็จ 2026-09-15) — แก้ schema
  ที่เดียว: `prisma migrate dev` (local) → `prisma migrate deploy` (prod)
- ⚠️ `prisma migrate reset` ต้องรันด้วย role ที่เป็น owner ของ database/schema `public` (workout_tracker เป็น
  owner จึงผ่าน)

## Follow-ups

- ✅ **Done (2026-09-15):** baseline production ขึ้น Prisma Migrate (`prisma migrate resolve --applied 0001_init`)
  — runbook: `docs/baseline-prod-to-prisma-migrate.md`
- `supabase/migrations/` เก็บเป็น **archive** (ดู `supabase/README.md`) — ไม่ถูก apply แล้ว
- (optional, ยังไม่ทำ) ลบ Supabase-only objects ที่ตายบน prod (RLS policies, `referral_count()`,
  `import_backup` 2-arg) ให้ prod ตรง baseline เป๊ะ — SQL อยู่ใน runbook Step 5a
- ✅ Supabase local stack หยุดแล้ว (`supabase stop`)
