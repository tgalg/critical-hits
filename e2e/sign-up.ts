import { expect, type Page } from "@playwright/test";

// Signs up a new player and waits for the account page. Better Auth allows
// only a few sign-ups per address every 10 seconds, and parallel specs share
// one address, so a rate-limited attempt waits out the window and retries.
export async function signUp(
  page: Page,
  name: string,
  email = `${name}@example.com`,
) {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("correct horse battery");
  // The test server requires this invite (playwright.config.ts).
  await page.getByLabel("Invite code").fill("e2e-invite");
  const limited = page.locator("form p[role=alert]", {
    hasText: "Too many requests",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole("button", { name: "Sign up" }).click();
    const outcome = await Promise.race([
      page
        .waitForURL(/\/account$/)
        .then(() => "done" as const)
        .catch(() => "timeout" as const),
      limited
        .waitFor()
        .then(() => "limited" as const)
        .catch(() => "timeout" as const),
    ]);
    if (outcome !== "limited") break;
    await page.waitForTimeout(10_000);
  }
  await expect(page).toHaveURL(/\/account$/);
}
