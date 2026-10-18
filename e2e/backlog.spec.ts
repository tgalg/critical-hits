import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./sign-up";

// Needs the app's database (DATABASE_URL, migrated); seeds three games directly.
test.skip(!process.env.DATABASE_URL, "needs a migrated database");

const games = [
  { igdbId: 900_000_011, slug: "e2e-queue-alpha", title: "E2E Queue Alpha" },
  { igdbId: 900_000_012, slug: "e2e-queue-beta", title: "E2E Queue Beta" },
  { igdbId: 900_000_013, slug: "e2e-queue-gamma", title: "E2E Queue Gamma" },
];

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const {
    rows: [platform],
  } = await pool.query<{ id: number }>(
    `INSERT INTO platforms (igdb_id, name) VALUES (900000011, 'E2E Handheld')
     ON CONFLICT (igdb_id) DO UPDATE SET name = excluded.name RETURNING id`,
  );
  for (const game of games) {
    const {
      rows: [row],
    } = await pool.query<{ id: number }>(
      `INSERT INTO games (igdb_id, slug, title) VALUES ($1, $2, $3)
       ON CONFLICT (igdb_id) DO UPDATE SET title = excluded.title RETURNING id`,
      [game.igdbId, game.slug, game.title],
    );
    await pool.query(
      "INSERT INTO game_platforms (game_id, platform_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [row.id, platform.id],
    );
  }
  await pool.end();
});

test("queues games, reorders, filters and removes them", async ({ page }) => {
  const name = `queuer${Date.now()}`;
  await signUp(page, name);

  for (const [index, game] of games.entries()) {
    await page.goto(`/games/${game.slug}`);
    if (index === 0) {
      await page
        .getByLabel("Backlog platform")
        .selectOption({ label: "E2E Handheld" });
    }
    await page.getByRole("button", { name: "Add to backlog" }).click();
    await expect(
      page.getByText(
        index === 0 ? "In your backlog on E2E Handheld." : "In your backlog.",
      ),
    ).toBeVisible();
  }

  await page.getByRole("link", { name: "Backlog", exact: true }).click();
  const titles = page.getByRole("listitem").getByRole("link");
  await expect(titles).toHaveText(games.map((game) => game.title));

  await page.getByRole("button", { name: "Move E2E Queue Gamma up" }).click();
  await expect(titles).toHaveText([
    "E2E Queue Alpha",
    "E2E Queue Gamma",
    "E2E Queue Beta",
  ]);

  await page.getByLabel("Platform").selectOption({ label: "E2E Handheld" });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(titles).toHaveText(["E2E Queue Alpha"]);

  await page.getByRole("button", { name: "Remove E2E Queue Alpha" }).click();
  await expect(
    page.getByText("Nothing in your backlog on that platform."),
  ).toBeVisible();

  await page.goto("/backlog");
  await expect(titles).toHaveText(["E2E Queue Gamma", "E2E Queue Beta"]);
});
