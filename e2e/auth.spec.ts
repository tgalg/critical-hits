import { expect, test } from "@playwright/test";
import { signUp } from "./sign-up";

// Needs the app's database (DATABASE_URL, migrated) and BETTER_AUTH_URL matching the test server.
test.skip(!process.env.DATABASE_URL, "needs a migrated database");

test("signs up, lands on the account page, signs out and back in", async ({
  page,
}) => {
  const name = `player${Date.now()}`;
  await signUp(page, name);
  await expect(page.getByText(`@${name}`)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel("Email or username").fill(name.toUpperCase());
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("shows an error for a wrong password", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email or username").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("turns sign-ups away without the invite code", async ({
  page,
  request,
}) => {
  const name = `uninvited${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`${name}@example.com`);
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByLabel("Invite code").fill("not-the-code");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.locator("form p[role=alert]")).toHaveText(
    "That invite code isn't right.",
  );

  // Skipping the form doesn't skip the check.
  const response = await request.post("/api/auth/sign-up/email", {
    data: {
      email: `${name}@example.com`,
      username: name,
      name,
      password: "correct horse battery",
    },
    headers: { origin: "http://127.0.0.1:3100" },
  });
  expect(response.ok()).toBe(false);
  expect(await response.text()).toContain("invite_required");
});
