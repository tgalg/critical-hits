import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./sign-up";

// Needs the app's database (DATABASE_URL, migrated); seeds one game directly.
test.skip(!process.env.DATABASE_URL, "needs a migrated database");

const slug = "e2e-profile-pick";

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `INSERT INTO games (igdb_id, slug, title) VALUES (900000031, $1, 'E2E Profile Pick')
     ON CONFLICT (igdb_id) DO UPDATE SET title = excluded.title`,
    [slug],
  );
  await pool.end();
});

test("edits a profile, picks a favourite and shows it publicly", async ({
  page,
  browser,
}) => {
  const name = `profiler${Date.now()}`;
  await signUp(page, name);

  const renamed = `${name}.Renamed`;
  await page.getByLabel("Username").fill(renamed);
  await page.getByLabel("Display name").fill("Profile Tester");
  await page.getByLabel("Bio").fill("Plays everything once.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByText(`@${renamed}`)).toBeVisible();

  await page.goto(`/games/${slug}`);
  await page.getByRole("button", { name: "Add to favourite four" }).click();
  await expect(page.getByText("One of your favourite four.")).toBeVisible();
  await page.getByRole("textbox", { name: "Review" }).fill("A keeper.");
  await page.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByRole("status")).toHaveText("Logged.");

  const visitor = await browser.newPage();
  await visitor.goto(`/u/${renamed.toLowerCase()}`);
  await expect(
    visitor.getByRole("heading", { name: "Profile Tester" }),
  ).toBeVisible();
  await expect(visitor.getByText("Plays everything once.")).toBeVisible();
  const favourites = visitor.getByRole("region", { name: "Favourite four" });
  await expect(
    favourites.getByRole("link", { name: "E2E Profile Pick" }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("region", { name: "Reviews" }).getByText("A keeper."),
  ).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Edit profile" })).toHaveCount(
    0,
  );
  await visitor.close();
});

test("shows a not-found page for an unknown player", async ({ page }) => {
  for (const path of ["/u/no-such-player-anywhere", "/u/%25"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  }
});
