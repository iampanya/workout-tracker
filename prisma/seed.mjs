// Seed the preset exercises. Reuses supabase/seed.sql as the single source of the
// preset list (idempotent: it ends with `on conflict do nothing`), so there is no
// duplicated list to keep in sync. Run automatically by `prisma migrate reset`
// (wired via `migrations.seed` in prisma.config.ts) or manually via `prisma db seed`.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const seedPath = fileURLToPath(new URL("../supabase/seed.sql", import.meta.url));
const sql = readFileSync(seedPath, "utf8");

try {
  await prisma.$executeRawUnsafe(sql);
  console.log("Seeded preset exercises from supabase/seed.sql");
} finally {
  await prisma.$disconnect();
}
