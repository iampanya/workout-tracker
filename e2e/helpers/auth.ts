import { expect, type Page } from "@playwright/test";
import { TEST_USER } from "./test-user";

/** Log the seeded E2E user in through the real login form. */
export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(TEST_USER.username);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
