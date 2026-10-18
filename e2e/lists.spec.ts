import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./sign-up";

// Needs the app's database (DATABASE_URL, migrated); seeds two games directly.
test.skip(!process.env.DATABASE_URL, "needs a migrated database");

const games = [
  { igdbId: 900_000_021, slug: "e2e-list-first", title: "E2E List First" },
  { igdbId: 900_000_022, slug: "e2e-list-second", title: "E2E List Second" },
];

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  for (const game of games) {
    await pool.query(
      `INSERT INTO games (igdb_id, slug, title) VALUES ($1, $2, $3)
       ON CONFLICT (igdb_id) DO UPDATE SET title = excluded.title`,
      [game.igdbId, game.slug, game.title],
    );
  }
  await pool.end();
});

test("makes a ranked list, adds and reorders games, shares it", async ({
  page,
  browser,
}) => {
  const name = `lister${Date.now()}`;
  await signUp(page, name);

  await page.getByRole("link", { name: "Lists", exact: true }).click();
  await expect(page.getByText("No lists yet.")).toBeVisible();
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByText("Give your list a title.")).toBeVisible();
  await page.getByLabel("Title").fill("E2E Top Picks");
  await page.getByLabel("Description").fill("Two games I'd replay.");
  await page.getByLabel("Ranked").check();
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page).toHaveURL(/\/lists\/\d+$/);
  const listUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "E2E Top Picks" }),
  ).toBeVisible();

  for (const game of games) {
    await page.goto(`/games/${game.slug}`);
    await page.getByRole("button", { name: "Add to list" }).click();
    await expect(page.getByRole("status")).toHaveText("Added.");
  }
  await page.getByRole("button", { name: "Add to list" }).click();
  await expect(page.getByRole("status")).toHaveText("Already on that list.");

  await page.goto(listUrl);
  const titles = page.getByRole("list", { name: "Games" }).getByRole("link");
  await expect(titles).toHaveText(games.map((game) => game.title));
  await page.getByRole("button", { name: "Move E2E List Second up" }).click();
  await expect(titles).toHaveText(["E2E List Second", "E2E List First"]);
  await page
    .getByLabel("Note on E2E List First", { exact: true })
    .fill("Best soundtrack.");
  await page
    .getByRole("button", { name: "Save note on E2E List First" })
    .click();
  await expect(
    page.getByLabel("Note on E2E List First", { exact: true }),
  ).toHaveValue("Best soundtrack.");

  // Signed-out visitors can read a public list, but not a private one.
  const visitor = await browser.newPage();
  await visitor.goto(listUrl);
  await expect(visitor.getByText(`A list by ${name}`)).toBeVisible();
  await expect(
    visitor.getByRole("list", { name: "Games" }).getByRole("link"),
  ).toHaveText(["E2E List Second", "E2E List First"]);
  await expect(visitor.getByText("Best soundtrack.")).toBeVisible();
  await expect(visitor.getByRole("button", { name: /Remove/ })).toHaveCount(0);

  await page.getByLabel("Public").uncheck();
  await page.getByRole("button", { name: "Save list" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await visitor.reload();
  await expect(
    visitor.getByText("This page could not be found."),
  ).toBeVisible();
  await visitor.close();

  await page.getByRole("button", { name: "Delete this list" }).click();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(page.getByText("No lists yet.")).toBeVisible();
});
