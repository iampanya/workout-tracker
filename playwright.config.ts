import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Playwright's config + globalSetup run in plain Node (not through Next), so load the
// same local env Next reads for `build`/`start` — the seed step needs the service-role key.
dotenv.config({ path: ".env.local" });

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// Default to a production build (`next build && next start`) so E2E exercises the same
// output that gets deployed. Set E2E_DEV=1 for a faster `next dev` loop while iterating.
const devMode = process.env.E2E_DEV === "1";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: devMode ? "npm run dev" : "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
