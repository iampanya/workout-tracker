import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 moves connection URLs out of schema.prisma into this config file.
// `dotenv/config` loads .env (local Postgres URLs); Vercel injects them in prod.
// DIRECT_URL is used for schema operations (db pull / migrate); the app runtime
// connects through the pg driver adapter in lib/db.ts (pooled URL).
//
// Fall back to DATABASE_URL when DIRECT_URL is unset (locally they're equal; on
// Vercel `prisma generate` runs in postinstall and only needs the config to load,
// not a live connection). Using plain process.env instead of prisma's `env()`
// avoids the eager PrismaConfigEnvError that fails the build when DIRECT_URL is
// missing — schema ops that truly need a direct connection still require it to be set.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Run after migrations on `prisma migrate reset` / `prisma db seed`.
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
