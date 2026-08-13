import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// Flow #2: the core loop of the whole app — start a workout, add an exercise, log a set,
// finish. This is where the browser-only UI gotchas live (finish guard, ConfirmDialog,
// the exercise combobox, the stepper NumberFields) that the service-layer tests can't see.
test.describe("core workout loop", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("start freeform, log a set, and finish", async ({ page }) => {
    await page.goto("/log");
    await page.getByRole("button", { name: "Freeform Workout" }).click();
    await expect(page).toHaveURL(/\/log\/[0-9a-f-]+/);

    // Add an exercise via the searchable combobox (Bench Press is a seeded preset).
    await page.getByRole("combobox", { name: "Exercise" }).click();
    await page.getByRole("combobox", { name: "Exercise" }).fill("Bench Press");
    await page.getByRole("option", { name: "Bench Press", exact: true }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // Log a working set. Target the number inputs by their spinbutton role — the
    // NumberField also exposes "Decrease/Increase Weight (kg)" stepper buttons, so a bare
    // label lookup is ambiguous.
    await page.getByRole("spinbutton", { name: "Weight (kg)" }).fill("60");
    await page.getByRole("spinbutton", { name: "Reps" }).fill("10");
    await page.getByRole("button", { name: "Add Set" }).click();

    await expect(page.getByText(/Set 1:\s*60kg/)).toBeVisible();

    // Finish -> lands back on the dashboard.
    await page.getByRole("button", { name: "Finish Workout" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("cannot finish a workout with no logged sets", async ({ page }) => {
    await page.goto("/log");
    await page.getByRole("button", { name: "Freeform Workout" }).click();
    await expect(page).toHaveURL(/\/log\/[0-9a-f-]+/);
    const sessionUrl = page.url();

    // Finishing with nothing logged is blocked by a guard dialog, not a redirect.
    await page.getByRole("button", { name: "Finish Workout" }).click();
    await expect(page.getByText("Can't finish yet")).toBeVisible();

    // Dismiss the alert; the session is still open (no redirect happened).
    await page.getByRole("button", { name: "Got it" }).click();
    expect(page.url()).toBe(sessionUrl);
  });
});
