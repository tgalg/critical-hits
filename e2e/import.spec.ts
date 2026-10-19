import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./sign-up";

// Needs the app's database (DATABASE_URL, migrated); seeds two games directly.
test.skip(!process.env.DATABASE_URL, "needs a migrated database");

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `INSERT INTO games (igdb_id, slug, title) VALUES
       (900000010, 'e2e-import-quest', 'E2E Import Quest'),
       (900000011, 'e2e-import-saga', 'E2E Import Saga')
     ON CONFLICT (igdb_id) DO UPDATE SET title = excluded.title`,
  );
  await pool.end();
});

test("imports a pasted list into the diary", async ({ page }) => {
  await signUp(page, `importer${Date.now()}`);

  await page.goto("/diary");
  await page.getByRole("link", { name: "Import games" }).click();
  await page
    .getByRole("textbox", { name: "Games you've finished" })
    .fill(
      "2024\nE2E Import Quest\n2025-03-04 e2e import saga\nNo Such Game Anywhere",
    );
  await page.getByRole("button", { name: "Check matches" }).click();
  await expect(page.getByText("2 of 3 found")).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "No Such Game Anywhere" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Import ticked games" }).click();
  await expect(page.getByText("Added 2 plays to your diary.")).toBeVisible();

  await page.goto("/diary");
  await expect(
    page.getByRole("link", { name: "E2E Import Quest", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("March 2025")).toBeVisible();
});
