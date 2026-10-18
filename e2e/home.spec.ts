import { expect, test } from "@playwright/test";

test("loads the Critical Hits home page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Critical Hits");
  await expect(
    page.getByRole("heading", { name: "Critical Hits", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Coming soon.", { exact: true })).toBeVisible();
});
