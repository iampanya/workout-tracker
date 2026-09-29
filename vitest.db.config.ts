import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// DB-backed suite (`npm run test:db`): same as the base config, plus a teardown that deletes the
// test users createTestUser() leaves behind. Kept out of the base config so `npm test` (pure,
// no DB) never connects to Postgres.
export default mergeConfig(
  base,
  defineConfig({ test: { globalSetup: ["./lib/test-global-setup.ts"] } })
);
