import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moves connection URLs out of schema.prisma into this config file.
// `dotenv/config` loads .env (local Postgres URLs); Vercel injects them in prod.
// DIRECT_URL is used for schema operations (db pull / migrate); the app runtime
// connects through the pg driver adapter in lib/db.ts (pooled URL).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Run after migrations on `prisma migrate reset` / `prisma db seed`.
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
