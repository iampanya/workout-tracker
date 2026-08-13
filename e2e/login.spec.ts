import { test, expect } from "@playwright/test";
import { TEST_USER } from "./helpers/test-user";

// Flow #1: login is the gate to the whole app. It logs in by username (not email) via
// the `loginWithUsername` server action, which resolves username -> email through a
// `profiles` row seeded in global-setup.ts.
test.describe("login", () => {
  test("valid credentials land on the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(TEST_USER.username);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("wrong password shows a generic error and stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(TEST_USER.username);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();

    // One generic message for every failure — no username enumeration.
    await expect(page.getByText("Incorrect username or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
