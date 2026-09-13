import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 connects through a driver adapter. node-postgres talks straight to Postgres via
// DATABASE_URL — in production this must be the pooled connection string (Supavisor :6543,
// ?pgbouncer=true&connection_limit=1) so serverless invocations don't exhaust connections.
// Swapping DATABASE_URL to any other Postgres host is the whole point (portability).
//
// Cached on globalThis so Next's dev HMR doesn't open a new pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
