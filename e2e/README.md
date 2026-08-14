# E2E Tests (Playwright)

เทสต์ระดับเบราว์เซอร์ที่จำลอง "ผู้ใช้จริง" คลิกผ่านแอปตั้งแต่ login จนจบ flow
ต่างจากเทสต์เดิมในโปรเจกต์:

| ชั้น | คำสั่ง | เห็นอะไร |
|---|---|---|
| ตรรกะล้วน | `npm test` | ฟังก์ชัน pure ไม่มี DB |
| Service + DB | `npm run test:db` | `lib/**/service.ts` ยิง Supabase local จริง |
| **E2E (ไฟล์นี้)** | `npm run test:e2e` | **เบราว์เซอร์จริง → UI → server action → DB ครบวงจร** |

E2E คือชั้นเดียวที่เห็นบั๊กที่โผล่เฉพาะในเบราว์เซอร์ (finish guard, ConfirmDialog,
combobox, stepper) และเห็น server action + page.tsx ที่ service test ข้ามไป

---

## สิ่งที่ต้องมีก่อนรัน (Prerequisites)

1. **Docker + Supabase local รันอยู่** — `supabase start`
2. **`.env.local` มีค่าครบ** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (ค่าพิมพ์ออกมาตอน `supabase start`)
3. **ติดตั้ง browser binary ครั้งแรกครั้งเดียว** — `npx playwright install chromium`

---

## รันยังไง

```bash
# รันทั้ง suite (ค่า default = build โปรดักชันแล้วรัน)
npm run test:e2e

# รันเร็วตอนพัฒนา: ใช้ next dev แทน production build
E2E_DEV=1 npm run test:e2e

# รันเฉพาะไฟล์เดียว
npx playwright test e2e/login.spec.ts

# รันเฉพาะเทสต์ที่ชื่อ match (-g = grep)
npx playwright test -g "finish"

# เปิดโหมด UI แบบ interactive (ดู timeline, time-travel debugging)
npx playwright test --ui

# ดู trace/รายงานหลังรัน
npx playwright show-report
```

> หลังรันจะมีโฟลเดอร์ `playwright-report/` และ `test-results/` เกิดขึ้น — ทั้งคู่ถูก
> gitignore ไว้แล้ว ไม่ต้องกังวล

---

## เกิดอะไรขึ้นตอนกด `npm run test:e2e` (lifecycle)

```
1. Playwright อ่าน playwright.config.ts
   └─ dotenv โหลด .env.local เข้า process.env (globalSetup ต้องใช้ service-role key)

2. webServer สตาร์ทแอป
   └─ default: `next build && next start` → เทสต์โค้ดชุดเดียวกับที่ deploy จริง
   └─ รอจน http://localhost:3000 ตอบ (reuseExistingServer: ถ้ามีเซิร์ฟเวอร์ค้างอยู่แล้วใช้ซ้ำ)

3. globalSetup (e2e/global-setup.ts) — seed ผู้ใช้ทดสอบ 1 คน
   ├─ ลบ user เดิม (ถ้ามี) ผ่าน admin API → cascade ลบ profiles + ข้อมูล workout ทั้งหมด
   ├─ สร้าง auth user ใหม่ (email/password คงที่, email_confirm = true)
   └─ insert แถว `profiles { id, username }`  ← สำคัญ: login by username ต้องมีแถวนี้
                                                  createUser เฉย ๆ ไม่พอ
   ผลลัพธ์: ทุกครั้งที่รัน เริ่มจาก state สะอาดเหมือนกันเป๊ะ

4. รัน spec ทีละไฟล์ (workers: 1, ไม่ parallel — กัน state ชนกันบน DB เดียว)
   แต่ละ test เปิดเบราว์เซอร์ใหม่ → คลิกผ่าน UI จริง → assert

5. เซิร์ฟเวอร์ถูกปิด, สรุปผล pass/fail
```

---

## โครงสร้างไฟล์

```
e2e/
├── global-setup.ts        seed/reset ผู้ใช้ทดสอบ (รันครั้งเดียวก่อนทั้ง suite)
├── helpers/
│   ├── test-user.ts       credential คงที่ (username e2e_tester / password)
│   └── auth.ts            ฟังก์ชัน login(page) ใช้ซ้ำใน spec
├── login.spec.ts          flow #1 — login
└── log-workout.spec.ts    flow #2 — core loop (start → add → log → finish)
```

config อยู่ที่ราก: [`playwright.config.ts`](../playwright.config.ts)

---

## flow ที่ครอบคลุมตอนนี้

**`login.spec.ts`**
- รหัสถูก → เข้า `/dashboard`
- รหัสผิด → ขึ้น error กลาง ๆ "Incorrect username or password" และค้างที่ `/login`
  (ยืนยันว่าไม่รั่ว username enumeration)

**`log-workout.spec.ts`**
- happy path: Freeform → เลือก Bench Press → กรอก 60kg × 10 → Add Set → Finish → `/dashboard`
- finish guard: กด Finish โดยยังไม่มี set → ขึ้น dialog "Can't finish yet" และไม่ redirect

---

## เขียนเทสต์ใหม่ + ข้อควรระวัง (gotchas)

**เกาะ element ด้วย role/label ที่ผู้ใช้เห็น** ไม่ใช่ CSS class (class เปลี่ยนบ่อย):

```ts
page.getByRole("button", { name: "Log in" })
page.getByLabel("Username")
page.getByRole("combobox", { name: "Exercise" })
```

**ปุ่ม "Add" ซ้ำกับ "Add Set"** → ใส่ `exact: true`:
```ts
page.getByRole("button", { name: "Add", exact: true })
```

**`NumberField` (weight/reps) ต้องใช้ `spinbutton` ไม่ใช่ `getByLabel`** — เพราะปุ่ม +/-
มี aria-label "Increase/Decrease Weight (kg)" ทำให้ label ซ้ำ 3 ตัว:
```ts
page.getByRole("spinbutton", { name: "Weight (kg)" }).fill("60")
```

**ต้องล็อกอินก่อนถึงหน้าหลัง auth** → เรียก `login(page)` ใน `beforeEach`
(หน้าใน `app/(app)` ถูก proxy.ts เด้งไป `/login` ถ้าไม่มี user)

**อย่า assert ข้อความที่มีอักขระ `×` (U+00D7) แบบตรงตัว** — ใช้ regex บางส่วนแทน เช่น
`getByText(/Set 1:\s*60kg/)`

**ต้องการ user/ข้อมูลเริ่มต้นเฉพาะ?** แก้ที่ `global-setup.ts` — อย่า seed ในตัว spec
เพราะจะทำให้ test พึ่งลำดับการรัน

---

## พิสูจน์ว่าตาข่ายจับ regression ได้จริง

ลองทำลายชั่วคราวแล้วดูว่าเทสต์แดง เช่น ใน `LoggingClient.tsx` เปลี่ยน
`router.push("/dashboard")` (หลัง finish) เป็น `router.push("/log")` → เทสต์ happy path
จะ fail ที่ `toHaveURL(/\/dashboard/)` แล้ว `git checkout` คืนกลับ

---

## Troubleshooting

| อาการ | สาเหตุ/ทางแก้ |
|---|---|
| `missing NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY` | ยังไม่ได้ `supabase start` หรือ `.env.local` ว่าง |
| ค้างตอน build/start นาน | `next build` ครั้งแรกช้าเป็นปกติ (timeout ตั้งไว้ 180s) ลอง `E2E_DEV=1` ให้เร็วขึ้น |
| `Executable doesn't exist ... chromium` | ยังไม่ได้ `npx playwright install chromium` |
| login fail ทั้งที่ seed แล้ว | เช็คว่า migration `0003` (ตาราง profiles) apply แล้ว — `supabase db reset` ถ้าจำเป็น |
| strict mode violation (เจอหลาย element) | selector กว้างไป — ใส่ `exact: true` หรือใช้ role ที่เจาะจงกว่า (ดู gotchas) |

---

## ยังไม่ได้ทำ (สเต็ปถัดไป)

- **CI** — ยกทั้ง config นี้ขึ้น GitHub Actions (`supabase start` → build → `playwright test`)
  แทบไม่ต้องแก้ตรรกะเทสต์
- ขยาย flow: discard workout, สร้าง+start routine (ทดสอบ snapshot ชื่อ), signup + invite
