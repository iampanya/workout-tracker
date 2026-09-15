# Runbook: Baseline production onto Prisma Migrate (retire `supabase db push`)

**เป้าหมาย:** ทำให้ **Prisma Migrate เป็น single source of truth ของ schema ทั้ง local + prod**
เลิกเขียน migration 2 ที่ และเลิกใช้ `supabase db push`

> **หลักการ:** prod มี schema (สร้างโดย `supabase/migrations/0001–0010`) ที่ตรงกับ `prisma/migrations/0001_init`
> อยู่แล้ว เราแค่ **บอก Prisma ว่า 0001_init ถูก apply ไปแล้ว** (mark ใน `_prisma_migrations`) โดย **ไม่ re-run**
>
> ⚠️ คำสั่งที่แตะ prod ทั้งหมด **คุณเป็นคนรัน** (มี prod `DIRECT_URL`) — ห้าม AI รันให้

ตั้งค่าตัวแปรก่อน (ใช้ **direct** connection :5432 ของ Supabase prod ไม่ใช่ pooled):
```bash
export PROD_DIRECT_URL="postgresql://postgres:<pw>@<host>:5432/postgres"
```

---

## Step 1 — พิสูจน์ว่า schema prod == baseline (safe gate)

เทียบ structural fingerprint ของ prod กับ local (`workout_tracker_dev` = baseline):
```bash
# local (baseline) — ผ่าน container postgres
docker cp scripts/schema-fingerprint.sql postgres:/tmp/fp.sql
docker exec -e PGPASSWORD='<local-pw>' postgres \
  psql -U workout_tracker -d workout_tracker_dev -AtqXf /tmp/fp.sql > /tmp/local_fp.txt

# prod
psql "$PROD_DIRECT_URL" -AtqXf scripts/schema-fingerprint.sql > /tmp/prod_fp.txt

diff /tmp/local_fp.txt /tmp/prod_fp.txt && echo "IDENTICAL — safe to baseline" || echo "DRIFT — stop & review"
```
- **diff ว่าง = ตารางเหมือนกันเป๊ะ → ไปต่อได้** (RLS policies / `referral_count` / `import_backup` 2-arg ที่ prod
  มีเกินมาไม่ถูก fingerprint จับ เพราะไม่กระทบการ track ของ Prisma — จงใจ)
- **ถ้า diff โผล่ระดับ column/index/FK/CHECK → มี drift จริง หยุดก่อน** แล้วมาคุยกัน

## Step 2 — Backup prod
Supabase Dashboard → Database → Backups สร้าง snapshot / เปิด PITR

## Step 3 — ยืนยันปลายทาง แล้ว resolve (mark 0001_init เป็น applied)
```bash
# ยืนยันก่อนว่าชี้ prod จริง — ต้องเห็น host ของ Supabase prod
DIRECT_URL="$PROD_DIRECT_URL" npx prisma migrate status

# mark 0001_init ว่า applied แล้ว (ไม่ re-run SQL — แค่เขียนแถวใน _prisma_migrations)
DIRECT_URL="$PROD_DIRECT_URL" npx prisma migrate resolve --applied 0001_init
```

## Step 4 — verify
```bash
DIRECT_URL="$PROD_DIRECT_URL" npx prisma migrate status
# ต้องขึ้น: "Database schema is up to date!" และเห็น 0001_init เป็น applied
```
เปิดเว็บ prod ทดสอบ sign in + ดูข้อมูล — ต้องปกติ (Step นี้ไม่ได้แตะ data เลย)

---

## Workflow ใหม่ (หลัง baseline) — แทน `supabase db push`

ทุกครั้งที่แก้ schema:
```bash
# 1) local: แก้ prisma/schema.prisma แล้วสร้าง+apply migration
npx prisma migrate dev --name <ชื่อสั้นๆ>

# 2) prod: apply migration ใหม่ ก่อน deploy code เสมอ (วินัยเดิม: DB ก่อน → code)
DIRECT_URL="$PROD_DIRECT_URL" npx prisma migrate deploy
```
- **ไม่ต้อง `supabase db push` / ไม่ต้องเขียน SQL 2 ที่อีก**
- ⚠️ view/function/trigger (`exercise_prs`, `import_backup`, `gen_referral_code`, `handle_new_user`) **ไม่อยู่ใน
  `schema.prisma`** → ถ้าแก้ของพวกนี้ ต้อง **เขียน SQL เพิ่มเองในไฟล์ migration** ที่ `migrate dev` สร้าง แล้ว
  `prisma db pull` ให้ schema.prisma sync
- ⚠️ **อย่าเอา `prisma migrate deploy` ใส่ Vercel build command** — รันมือ/CI แยกด้วย prod `DIRECT_URL` ก่อน promote

---

## Step 5 — เก็บกวาดหลัง baseline สำเร็จ (optional แต่แนะนำ)

หลังยืนยัน Step 4 ผ่านและใช้งาน prod ได้ 2–3 วันแล้ว:

**5a. (optional) ลบ Supabase-only objects ที่ตายแล้วบน prod** ให้ prod ตรง baseline เป๊ะ (กัน edge-case ที่ policy
เก่าค้างขวางการ ALTER ในอนาคต) — สคริปต์พร้อมรัน (idempotent, transaction, ลบ 11 policies + `referral_count()` +
`import_backup` 2-arg; ไม่แตะ data):
```bash
psql "$PROD_DIRECT_URL" -f scripts/drop-legacy-supabase-objects.sql
```

**5b. Retire Supabase** — ทำแล้ว: `supabase/` เก็บเป็น archive (ดู `supabase/README.md`, `seed.sql` ยังใช้ผ่าน
`prisma/seed.mjs`); Supabase CLI ไม่อยู่ใน local workflow แล้ว; docs (`CLAUDE.md`/`README`/`DEPLOY`) เป็น single-source แล้ว
- อัปเดตเอกสารให้เหลือ **single source**: `CLAUDE.md` (ลบ gotcha "Two migration sources"),
  `docs/DEPLOY.md` (prod ใช้ `prisma migrate deploy`), `docs/adr/0001-*` (mark Follow-up ว่าทำแล้ว)

---

## Rollback (ถ้า Step 3 ผิดพลาด)
`migrate resolve` แค่เขียนแถวใน `_prisma_migrations` **ไม่แตะ schema/data** — ถ้า mark ผิดให้ลบแถวออก:
```sql
delete from _prisma_migrations where migration_name = '0001_init';
```
แล้วเริ่ม Step 1 ใหม่ (schema/data ยังครบ)
