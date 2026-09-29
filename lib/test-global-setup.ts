import "dotenv/config";
import pg from "pg";

// Global setup for the DB-backed suite (`npm run test:db`, via vitest.db.config.ts). createTestUser()
// inserts a `test-…@test.local` user per test and nothing deletes them, so after the run we remove
// every such user and their data. Matching all of them (not just this run's) also clears leftovers
// from an aborted earlier run.
const TEST_EMAIL = "test-%@test.local";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// Children first: exercise_id FKs are ON DELETE RESTRICT, so letting the users-row cascade reach
// exercises before the sets that reference them can fail mid-statement.
const CHILD_TABLES = ["sets", "session_exercises", "sessions", "routine_exercises", "routines", "exercises"];

export async function deleteTestUsers(connectionString: string): Promise<number> {
  const host = new URL(connectionString).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    console.warn(`[test teardown] DATABASE_URL host is ${host}, not local; skipping test-user cleanup.`);
    return 0;
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("begin");
    const testUsers = "(select id from users where email like $1)";
    for (const table of CHILD_TABLES) {
      await client.query(`delete from ${table} where user_id in ${testUsers}`, [TEST_EMAIL]);
    }
    // profiles cascade from users.
    const { rowCount } = await client.query("delete from users where email like $1", [TEST_EMAIL]);
    await client.query("commit");
    return rowCount ?? 0;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    await client.end();
  }
}

export default function setup() {
  return async function teardown() {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    const removed = await deleteTestUsers(url);
    if (removed > 0) console.log(`[test teardown] removed ${removed} test users`);
  };
}
