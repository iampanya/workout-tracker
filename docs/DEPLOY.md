# คู่มือ Deploy: Postgres + Vercel + Google OAuth

Runbook สำหรับ deploy แอป workout-tracker ขึ้น production
Stack ใหม่: **Next.js + Prisma (ต่อ Postgres ตรง) + Auth.js (Google sign-in)** — ไม่พึ่ง Supabase Auth/PostgREST อีกแล้ว Supabase เหลือบทบาทแค่ "ที่ host Postgres" (ซึ่งจะเปลี่ยนไปใช้เจ้าอื่นก็ได้)

> **หมายเหตุ (local ≠ prod):** เอกสารนี้เป็น runbook **production เท่านั้น** — prod ยังใช้ **Supabase-hosted Postgres** + `supabase/migrations/` (`supabase db push`) ส่วน **local dev ย้ายไปใช้ Docker Postgres + Prisma Migrate แล้ว** (ดู `README.md` และ `docs/adr/0001-local-db-on-docker-postgres.md`) จนกว่าจะ baseline prod ขึ้น Prisma Migrate migration source จะแยกกันอยู่ชั่วคราว

> **หลักคิดที่ต้องจำ 3 ข้อ:**
> 1. **โครงสร้าง (migrations) เดินทางข้ามสภาพแวดล้อมเองได้** แต่ **ข้อมูล (seed exercises) ต้องหยอดเอง** ทุกครั้ง
> 2. **key/URL ใน `.env.local` = ของ Docker บนเครื่องคุณ ใช้กับ production ไม่ได้** — prod ต้องใช้ connection string ของ Postgres คลาวด์ + Google client ของจริง
> 3. **การ isolate ข้อมูลอยู่ที่ระดับแอป (scope `user_id`)** ไม่ใช่ RLS — ไม่มี service-role key, ไม่มี public-signup toggle ให้ตั้งอีกแล้ว

สิ่งที่ต้องมีก่อนเริ่ม: Postgres สักที่ (Supabase / Neon / RDS / self-host), บัญชี [vercel.com](https://vercel.com), Google Cloud project, และโค้ดที่ push ขึ้น Git repo แล้ว

---

## ส่วน A — Database (Postgres)

### A1. เลือกที่ host Postgres + เอา connection string

แอปต่อ Postgres ผ่าน `DATABASE_URL` ตรงๆ — ใช้ Postgres เจ้าไหนก็ได้ ต้องการ 2 ค่า:

- **`DATABASE_URL`** — connection แบบ **pooled** (สำหรับ runtime บน Vercel serverless)
- **`DIRECT_URL`** — connection แบบ **direct** (สำหรับ apply migrations)

**ถ้าใช้ Supabase เป็นที่ host Postgres** (ทางที่เปลี่ยนน้อยสุด): **Project Settings → Database → Connection string**
- pooled: Supavisor พอร์ต **6543** ต่อท้าย `?pgbouncer=true&connection_limit=1` → ใส่ `DATABASE_URL`
- direct: พอร์ต **5432** → ใส่ `DIRECT_URL`

> **ทำไมต้อง pooled บน Vercel:** serverless เปิด connection เยอะมาก ถ้าต่อ direct 5432 จะเปิด connection ทะลักจน Postgres ปฏิเสธ — pooler (transaction mode) แก้ปัญหานี้

### A2. Apply migrations (โครงสร้าง)

**ถ้าเป็น Supabase-hosted Postgres:**
```bash
supabase link --project-ref <your-project-ref>
supabase db push          # รัน migrations 0001 → 0010 ตามลำดับ
```

**ถ้าเป็น Postgres เจ้าอื่น** (Neon/RDS/self-host หรือ vanilla Postgres): **อย่าใช้** `supabase/migrations/*.sql` เพราะมันพึ่ง `auth` schema / role `authenticated`,`service_role` / `auth.uid()` ของ Supabase (รันบน Postgres เปล่าไม่ผ่าน) — ให้ใช้ **Prisma Migrate baseline** แทน:
```bash
DIRECT_URL="$DIRECT_URL" npx prisma migrate deploy   # apply prisma/migrations/0001_init (vanilla PG)
```

> migrations สร้างตาราง + view `exercise_prs` + ฟังก์ชัน (`import_backup`, `gen_referral_code`, `handle_new_user`) + ตาราง Auth.js (`users`/`accounts`) และ **ปิด RLS** ให้เอง (0010)
> **หมายเหตุ 0010:** ถ้าย้ายมาจากระบบเดิม (GoTrue) มันจะ copy user จาก `auth.users` → `public.users` โดยคง id เดิม เพื่อให้ข้อมูลเก่าไม่หลุด FK

### A3. หยอด seed exercises (ข้อมูล — ไม่ auto)

รันไฟล์ `supabase/seed.sql` หนึ่งครั้ง ผ่าน SQL Editor (Supabase) หรือ `psql "$DIRECT_URL" -f supabase/seed.sql`

> **ถ้าลืม:** ตาราง `exercises` ว่าง → log workout ไม่ได้เพราะไม่มีท่าให้เลือก (`seed.sql` มี `on conflict do nothing` รันซ้ำปลอดภัย)

> **ไม่ต้อง bootstrap บัญชีแรกแล้ว** — พอ deploy เสร็จ login ด้วย Google ครั้งแรก trigger จะสร้าง profile ให้อัตโนมัติ (ต่างจากระบบเดิมที่ต้องหยอด SQL)

---

## ส่วน B — Google OAuth

### B1. ตั้งค่า OAuth client ให้รองรับโดเมน production

[Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials** → เปิด OAuth client เดิม (หรือสร้างใหม่แบบ *Web application*) → เพิ่ม **Authorized redirect URI**:
```
https://<your-domain>/api/auth/callback/google
```

> ⚠️ callback ของ Auth.js คือ `/api/auth/callback/google` (ไม่ใช่ของ Supabase เดิม `/auth/v1/callback` แล้ว) — ต้องใส่ URI นี้ให้ตรงเป๊ะทุกโดเมนที่ใช้ (local + prod) ไม่งั้นจะเจอ `redirect_uri_mismatch`

---

## ส่วน C — Vercel

### C1. Link โปรเจกต์
```bash
npx vercel link
```

### C2. ใส่ environment variables (production)
```bash
npx vercel env add DATABASE_URL production      # pooled (:6543, ?pgbouncer=true&connection_limit=1)
npx vercel env add DIRECT_URL production        # direct (:5432)
npx vercel env add AUTH_SECRET production        # openssl rand -base64 32
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel env add GOOGLE_SECRET production
npx vercel env add AUTH_URL production           # https://<your-domain> (แนะนำให้ตั้งชัดเจน)
```

> **กับดักอันดับ 1:** อย่า copy ค่าจาก `.env.local` — นั่นคือ Postgres ใน Docker บนเครื่องคุณ (`127.0.0.1:5432`) prod ต้องเป็น connection string ของ Postgres คลาวด์
> **กับดักอันดับ 2:** `DATABASE_URL` ต้องเป็น **pooled** (6543) ไม่ใช่ direct — ไม่งั้น serverless จะ connection ทะลัก
> **กับดักอันดับ 3:** `AUTH_SECRET` ต้องเป็นค่าสุ่มที่แข็งแรง และ **คงที่** ระหว่าง deploy (ถ้าเปลี่ยน session ของทุกคนจะหลุดทันที)

### C3. Deploy
```bash
npx vercel --prod
```

> build จะรัน `prisma generate` ให้เองผ่าน `postinstall`

---

## ส่วน D — หลัง deploy

### D1. เข้าใช้งาน
เปิด `<deployed-url>` → **Sign in with Google** → profile ถูกสร้างอัตโนมัติ → เข้า `/dashboard`

> **ผู้ใช้เดิม (ย้ายมาจาก GoTrue):** ข้อมูลจะกลับมาก็ต่อเมื่อ **email Google = email บัญชีเดิม** ที่ 0010 migrate มา (Auth.js link by email ให้ ผ่าน `allowDangerousEmailAccountLinking`) ถ้า email ไม่ตรง จะได้บัญชีใหม่ว่างเปล่า

### D2. Verify (ให้ครบ loop)
login ด้วย Google → **Log workout** → เลือกท่า + log สัก 2-3 set → ดูว่ามี **"New PR" banner** ตอนทำน้ำหนักเกินสถิติเดิม → **Finish** → เช็ค **dashboard** ขึ้น session นั้น → ลองทั้งมือถือและ desktop

---

## ส่วน E — อัปเดต production ที่มี migration ใหม่

**migrate DB ก่อน แล้วค่อย deploy Vercel เสมอ** — โค้ดใหม่ที่ query คอลัมน์/ฟังก์ชันที่ DB ยังไม่มีจะพัง

```bash
supabase db push        # หรือ psql รันไฟล์ .sql ใหม่ (ถ้าไม่ได้ใช้ Supabase host)
npx vercel --prod
```

> **env vars ไม่ต้องเพิ่มใหม่** ถ้า migration แค่แก้ schema — ใช้ชุดเดิม
> migrations ล่าสุดที่ต้องมีบน prod: `0008` (trigger auto-profile), `0009` (`import_backup` รับ user id param), `0010` (ตาราง Auth.js + repoint FK + ปิด RLS)

---

## Operational — เรื่องที่ต้องรู้

- **ถ้าใช้ Supabase free tier เป็น Postgres host:** auto-pause หลังไม่มี activity ~7 วัน → แอปต่อ DB ไม่ติด แก้: กด Resume ใน dashboard; ป้องกัน: อัป Pro plan หรือตั้ง cron ยิง query เบาๆ keep-alive
- **ย้าย Postgres ไปเจ้าอื่นเมื่อไรก็ได้:** dump ข้อมูลจากที่เดิม → restore ที่ใหม่ → เปลี่ยน `DATABASE_URL`/`DIRECT_URL` บน Vercel → redeploy (ไม่ต้องแก้โค้ด) นี่คือจุดประสงค์หลักของการย้ายมา Prisma
- **เพิ่ม/แก้ schema:** เขียน migration ไฟล์ใหม่ใน `supabase/migrations/` แล้ว `supabase db push` — อย่าแก้ไฟล์ migration เดิมที่ push ไปแล้ว (ถ้าเปลี่ยน Prisma model ด้วย ให้ `npx prisma db pull` + `prisma generate` ให้ schema.prisma ตรงกับ DB)
- **ปิด service ที่ไม่ใช้บน Supabase host:** แอปไม่ใช้ Supabase Auth/PostgREST แล้ว — ถ้า host Postgres บน Supabase จะปล่อย service พวกนั้นทิ้งไว้ก็ได้ (ไม่กระทบ)

---

## Cheat sheet — ลำดับที่ห้ามสลับ

```
Database                          Google + Vercel                หลัง deploy
────────────────────────         ──────────────────────         ──────────────────
A1 เอา connection string      →  B1 เพิ่ม redirect URI prod   →  D1 sign in with Google
A2 apply migrations              C1 vercel link                  D2 verify loop
A3 seed.sql                      C2 add env (pooled DATABASE_URL!)
                                 C3 vercel --prod
```

เหตุที่ Database ต้องมาก่อน: C2 ต้องกรอก connection string ที่ได้จาก A1
