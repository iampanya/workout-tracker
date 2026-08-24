# คู่มือ Deploy: Supabase (คลาวด์) + Vercel

Runbook แบบละเอียด สำหรับ deploy แอป workout-tracker ขึ้น production
ทำ **Supabase ก่อนเสมอ** แล้วค่อย Vercel — เพราะ Vercel ต้องใช้ URL/keys ที่เพิ่งเกิดขึ้นตอนสร้างโปรเจกต์ Supabase

> **หลักคิดที่ต้องจำ 2 ข้อ (จะทำให้ทุกขั้นตอน make sense):**
> 1. **โครงสร้าง (migrations) เดินทางข้ามสภาพแวดล้อมเองได้** — `supabase db push` ดันขึ้นให้
>    แต่ **ข้อมูล (seed exercises, บัญชีแรก) ต้องหยอดเองใน SQL Editor** ทุกครั้ง
> 2. **key ใน `.env.local` = ของ Docker บนเครื่องคุณ ใช้กับ production ไม่ได้** — ค่าจริงมาจาก dashboard คลาวด์เท่านั้น

สิ่งที่ต้องมีก่อนเริ่ม: บัญชี [supabase.com](https://supabase.com), บัญชี [vercel.com](https://vercel.com), Supabase CLI (`brew install supabase/tap/supabase`), และโค้ดที่ push ขึ้น Git repo แล้ว

---

## ส่วน A — Supabase (ทำก่อน)

### A1. สร้างโปรเจกต์คลาวด์

1. ไปที่ [supabase.com](https://supabase.com) → **New project**
2. ตั้งชื่อ, ตั้ง **database password** (จดไว้ให้ดี), เลือก region ใกล้ผู้ใช้ (เช่น Southeast Asia — Singapore)
3. รอสร้างเสร็จ ~2 นาที
4. เข้า **Project Settings → API** แล้วจดค่า 3 อย่างนี้ไว้:
   - **Project URL** — หน้าตา `https://<ref>.supabase.co`
   - **anon / public key**
   - **service_role key** ⚠️ (secret — ห้ามหลุด)

> จาก URL คุณจะเห็น **project ref** (ส่วน `<ref>`) ด้วย เอาไว้ใช้ตอน `link`

### A2. ปิด public signup (ล็อกประตูหลัง)

เข้า **Authentication → Sign In / Providers** (หรือ **Settings**) → **ปิด "Allow new users to sign up"**

> **ทำไม:** แอปนี้ invite-gated — บัญชีถูกมินต์ผ่าน server action ที่ใช้ service_role admin API หลังตรวจ invite code
> ถ้าเปิด public signup ทิ้งไว้ ใครก็ยิง Supabase Auth endpoint ตรงๆ สมัครบัญชีเองได้ **ข้าม invite gate ทั้งหมด**
> การปิดตรงนี้ *ไม่* กระทบหน้า `/signup` ของแอป เพราะมันไม่ได้ใช้ signup มาตรฐานของ Supabase

### A3. ดัน schema ขึ้น (migrations)

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

- `link` จะถาม database password (จากข้อ A1)
- `db push` จะรัน migrations ทั้ง 5 ไฟล์ (`0001_init` → `0005_backup_import`) เรียงตามลำดับ สร้างตาราง/RLS/view/ฟังก์ชันให้

> **ทำไมใช้ CLI:** migrations เป็น "โครงสร้าง" ที่ track ได้ว่าไฟล์ไหนรันไปแล้ว (ใน `supabase_migrations.schema_migrations`) จึง push ข้ามสภาพแวดล้อมได้ปลอดภัย
> **บน deploy ครั้งแรก (ยังไม่มี user):** `0004` แค่สร้างคอลัมน์ `referral_code`/`referred_by` + ฟังก์ชัน แล้ว drop ตาราง `invite_codes` เดิม — ไม่มีอะไรให้ backfill

### A4. หยอด seed exercises (ข้อมูล — CLI ไม่ทำให้)

เปิด **SQL Editor** ในโปรเจกต์คลาวด์ → paste เนื้อหาทั้งไฟล์ `supabase/seed.sql` → **Run** (รันครั้งเดียว)

> **ทำไมต้องทำเอง:** `supabase db push` **ไม่** รัน `seed.sql` บน remote (มันรันอัตโนมัติแค่ตอน `supabase start` / `db reset` ในเครื่อง local) เพราะ Supabase ถือว่า seed คือ dev fixtures ไม่กล้ายัดข้อมูลลง production ให้เอง
> **ถ้าลืมข้อนี้:** ตาราง `exercises` จะว่าง → เปิดแอปแล้ว log workout ไม่ได้เพราะไม่มีท่าให้เลือกใน `ExerciseCombobox`
> (`seed.sql` มี `on conflict do nothing` — เผลอรันซ้ำก็ปลอดภัย)

### A5. สร้างบัญชีแรก (ตัด loop ไก่-ไข่)

signup ต้องใช้ referral code ของ user ที่มีอยู่ → บัญชีแรกยังไม่มีใคร invite ได้ ต้อง bootstrap เองตรงๆ

1. **Authentication → Users → Add user** สร้าง auth user (ใส่ email + password)
2. ใน **SQL Editor** insert `profiles` row ที่ผูกกัน (username login + referral code ต้องใช้ทั้งคู่):

```sql
insert into public.profiles (id, username, referral_code)
values ('<the-new-user-id>', 'yourname', '<an-8-char-code>');
```

> **ทำไม:** ไม่มี UI สร้างบัญชีแรกได้เอง → หยอด profile row แรกที่นี่
> หลังจากนี้ทุกคน invite คนอื่นได้เองด้วย **invite link ในหน้า Profile** (ไม่ต้อง SQL อีก) — กด Regenerate เพื่อยกเลิก link ที่หลุดได้
> `<an-8-char-code>` ใช้ตัวอักษร A–Z/2–9 (เลี่ยง 0/O/1/I/L) เช่น `DEV12345`

---

## ส่วน B — Vercel

### B1. Link โปรเจกต์

```bash
npx vercel link
```

ตอบตามที่ถาม (เลือก scope + โปรเจกต์ หรือสร้างใหม่)

### B2. ใส่ environment variables (production)

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

แต่ละคำสั่งจะให้ paste ค่า — **เอาค่าจาก dashboard คลาวด์ (ข้อ A1) เท่านั้น**

> **กับดักอันดับ 1:** อย่า copy จาก `.env.local` เด็ดขาด — นั่นคือ key ของ Supabase ใน Docker บนเครื่องคุณ
> (URL เป็น `http://127.0.0.1:54321`) พอ Vercel เอาไปใช้จะต่อ `127.0.0.1` ของ *ตัวเซิร์ฟเวอร์ Vercel เอง* ที่ไม่มี Supabase → build ผ่านแต่ใช้จริง error หมด
> **กฎง่ายๆ:** ถ้า URL ขึ้นต้น `127.0.0.1`/`localhost` = ผิด, production ต้องเป็น `https://<ref>.supabase.co`
>
> **กับดักอันดับ 2 — ห้ามพลาดชีวิต:** `SUPABASE_SERVICE_ROLE_KEY` **ต้องไม่มี** prefix `NEXT_PUBLIC_`
> ตัวแปร `NEXT_PUBLIC_*` ถูกฝังลง bundle ฝั่ง browser (ใครเปิด DevTools ก็อ่านได้) — ส่วน service_role key
> **bypass RLS ทั้งหมด** (อ่าน/ลบข้อมูลทุก user, มินต์บัญชีข้าม invite, ดึง email ทุกคนได้) ถ้าหลุด = เจาะทั้งระบบในคีย์เดียว

> ถ้าจะเปิด preview deployments ด้วยในอนาคต ค่อย add ซ้ำเป็น `preview` ทีหลัง (รอบแรก production พอ)

### B3. Deploy

```bash
npx vercel --prod
```

รอ build เสร็จ จะได้ URL production กลับมา

---

## ส่วน C — หลัง deploy

### C1. เข้าใช้บัญชีแรก

เปิด `<deployed-url>/login` → login ด้วย username + password ของบัญชีที่ bootstrap ไว้ในข้อ A5
จากนั้นเปิดหน้า **Profile** → copy invite link ไปชวนคนอื่นสมัครที่ `/signup` ได้เลย

### C2. Verify (ให้ครบ loop)

login ด้วย username → **Log workout** → เลือกท่า + log สัก 2-3 set → ดูว่ามี **"New PR" banner** โผล่ตอนทำน้ำหนักเกินสถิติเดิม → **Finish** → เช็คว่า **dashboard** ขึ้น session นั้น
ลองทั้งบนมือถือและ desktop browser

---

## ส่วน D — อัปเดต production ที่ deploy ไปแล้ว (มี migration ใหม่)

เมื่อมี migration ไฟล์ใหม่ (เช่น `0004_referral_codes.sql`) และจะ deploy โค้ดที่ใช้ schema นั้น
**ต้อง migrate DB ก่อน แล้วค่อย deploy Vercel เสมอ** — เพราะโค้ดใหม่ query คอลัมน์/ฟังก์ชันที่ยังไม่มีใน DB จะพัง

```bash
# 1. Migrate DB ก่อน (link ไว้แล้วรันแค่บรรทัดนี้) — push เฉพาะ migration ที่ยังไม่เคยรัน
supabase db push

# 2. แล้วค่อย deploy โค้ด
npx vercel --prod    # หรือ push ขึ้น branch ให้ Vercel auto-deploy
```

> **ทำไมลำดับนี้ห้ามสลับ:** ถ้า deploy Vercel ก่อน โค้ดใหม่จะเรียกคอลัมน์ `referral_code`/RPC `referral_count()` ที่ DB ยังไม่มี → หน้า Profile + signup error
> **ช่วงรอยต่อสั้นๆ:** ระหว่าง `db push` เสร็จ ถึง Vercel deploy เสร็จ โค้ด**เก่า**ที่ยังรันอยู่จะ signup ไม่ได้ชั่วคราว (เพราะ `0004` drop ตาราง `invite_codes` ไปแล้ว) — deploy Vercel ตามให้ไวจบ

**เฉพาะ `0004`:** ถ้า production มี user อยู่แล้ว migration จะ **backfill `referral_code` ให้ทุกคนอัตโนมัติ** (ทุกคนได้ invite link ทันที) และเพิ่ม `referred_by`, สร้าง `referral_count()`, drop `invite_codes`

ตรวจหลัง push (SQL Editor):

```sql
select id, username, referral_code, referred_by from public.profiles;  -- ทุกแถวต้องมี referral_code
select to_regclass('public.invite_codes');                             -- ต้องได้ null (ถูก drop แล้ว)
```

> ตัว env vars ของ Vercel **ไม่ต้องเพิ่มอะไรใหม่** สำหรับ `0004` — ใช้ URL/anon/service_role key ชุดเดิม

**เฉพาะ `0005` (Backup/Restore):** migration แค่ **เพิ่มฟังก์ชัน `import_backup(jsonb, text)`** อย่างเดียว — ไม่แก้/ลบตารางเดิม, ไม่มี backfill, ไม่มีช่วงรอยต่อที่โค้ดเก่าพัง (โค้ดเก่าไม่รู้จักฟังก์ชันนี้อยู่แล้ว) จึง `db push` ก่อนหรือหลัง deploy Vercel ก็ได้ในทางปฏิบัติ — แต่ยึดลำดับเดิม (DB ก่อน) ไว้เป็นนิสัยจะปลอดภัยสุด

- ฟังก์ชันเป็น `SECURITY DEFINER` (เหมือน `referral_count()`) แต่ stamp `user_id = auth.uid()` ทุก row และคืนแค่ตัวเลขสรุป — ไม่รั่วข้อมูลข้ามผู้ใช้
- **env vars ไม่ต้องเพิ่มอะไรใหม่** — ใช้ชุดเดิม (ไม่พึ่ง service-role บน path นี้)

ตรวจหลัง push (SQL Editor):

```sql
select to_regprocedure('public.import_backup(jsonb, text)');  -- ต้องไม่ได้ null (ฟังก์ชันถูกสร้างแล้ว)
```

---

## Operational — เรื่องที่ต้องรู้หลังใช้ไปสักพัก

- **Free tier auto-pause หลังไม่มี API activity ~7 วัน** → แอปจะต่อ database ไม่ติด (ไม่ใช่ bug ของโค้ด)
  แก้: เข้า Supabase dashboard กด **Resume/Restore**
  ป้องกัน: (ก) อัป **Pro plan** ($25/เดือน ไม่มี pause — วิธีที่ถูกต้องถ้ามีคนใช้จริง),
  หรือ (ข) ตั้ง **Vercel Cron** ยิง endpoint เบาๆ (เช่น `select count(*) from exercises`) ทุกไม่กี่วันเพื่อ keep-alive
- **เพิ่ม/แก้ schema ทีหลัง:** เขียน migration ไฟล์ใหม่ใน `supabase/migrations/` → `supabase db push` (อย่าแก้ไฟล์ migration เดิมที่ push ไปแล้ว)
- **Invite คนเพิ่ม:** เปิดหน้า **Profile** → copy invite link ส่งให้เขาไปสมัครที่ `/signup` (code เติมให้อัตโนมัติ) — ไม่ต้อง SQL แล้ว

---

## Cheat sheet — ลำดับที่ห้ามสลับ

```
Supabase                          Vercel                        หลัง deploy
────────────────────────         ──────────────────────       ──────────────────
A1 สร้างโปรเจกต์ + จด keys    →  B1 vercel link            →  C1 login บัญชีแรก
A2 ปิด public signup            B2 add env (จากคลาวด์!)       C2 verify loop
A3 db push (schema)             B3 vercel --prod
A4 seed.sql (SQL Editor)
A5 bootstrap บัญชีแรก (SQL Editor)
```

เหตุที่ Supabase ต้องมาก่อน: B2 ต้องกรอกค่าที่เกิดใน A1 — ทำ Vercel ก่อนจะไม่มีอะไรไปใส่
