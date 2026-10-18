import { expect, test } from "@playwright/test";
import { Pool } from "pg";

// Needs the app's database (DATABASE_URL, migrated); seeds one game directly.
test.skip(!process.env.DATABASE_URL, "needs a migrated database");

const igdbId = 900_000_001;
const slug = "e2e-test-quest";

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `INSERT INTO games (igdb_id, slug, title, release_date, summary)
     VALUES ($1, $2, 'E2E Test Quest', '2024-03-01', 'A game that exists only in tests.')
     ON CONFLICT (igdb_id) DO NOTHING`,
    [igdbId, slug],
  );
  await pool.end();
});

test("searches for a game and opens its page", async ({ page }) => {
  await page.goto("/games");
  await page.getByLabel("Search games").fill("e2e test qest");
  await page.getByRole("button", { name: "Search" }).click();

  await page.getByRole("link", { name: /E2E Test Quest/ }).click();
  await expect(page).toHaveURL(new RegExp(`/games/${slug}$`));
  await expect(
    page.getByRole("heading", { name: /E2E Test Quest/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("No ratings yet")).toBeVisible();
  await expect(
    page.getByText("A game that exists only in tests."),
  ).toBeVisible();
});

test("shows a not-found page for an unknown game", async ({ page }) => {
  const response = await page.goto("/games/no-such-game");
  expect(response?.status()).toBe(404);
});
