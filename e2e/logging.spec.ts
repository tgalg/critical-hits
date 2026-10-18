import { expect, test } from "@playwright/test";
import { Pool } from "pg";

// Needs the app's database (DATABASE_URL, migrated); seeds one game directly.
test.skip(!process.env.DATABASE_URL, "needs a migrated database");

const slug = "e2e-log-legends";

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const {
    rows: [game],
  } = await pool.query<{ id: number }>(
    `INSERT INTO games (igdb_id, slug, title) VALUES (900000002, $1, 'E2E Log Legends')
     ON CONFLICT (igdb_id) DO UPDATE SET title = excluded.title RETURNING id`,
    [slug],
  );
  const {
    rows: [platform],
  } = await pool.query<{ id: number }>(
    `INSERT INTO platforms (igdb_id, name) VALUES (900000002, 'E2E Console')
     ON CONFLICT (igdb_id) DO UPDATE SET name = excluded.name RETURNING id`,
  );
  await pool.query(
    "INSERT INTO game_platforms (game_id, platform_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [game.id, platform.id],
  );
  await pool.end();
});

test("logs a game, sees it in the diary, edits and deletes it", async ({
  page,
}) => {
  const name = `logger${Date.now()}`;
  await page.goto(`/games/${slug}`);
  await expect(page.getByText("to log this game.")).toBeVisible();

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`${name}@example.com`);
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto(`/games/${slug}`);
  await page.getByLabel("Status").selectOption("finished");
  await page.getByLabel("Rating").selectOption({ label: "4.5 stars" });
  await page
    .getByLabel("Platform", { exact: true })
    .selectOption({ label: "E2E Console" });
  await page.getByLabel("Started").fill("2026-02-01");
  await page.getByLabel("Finished").fill("2026-01-01");
  await page.getByRole("button", { name: "Save log" }).click();
  await expect(
    page.getByText("The finish date can't be before the start date."),
  ).toBeVisible();
  // The form keeps what was typed after an error.
  await expect(page.getByLabel("Started")).toHaveValue("2026-02-01");

  await page.getByLabel("Finished").fill("2026-03-15");
  await page.getByLabel("Hours played").fill("12.5");
  await page.getByLabel("Favourite ♥").check();
  await page.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByRole("status")).toHaveText("Logged.");
  const plays = page.getByRole("region", { name: "Your plays" });
  await expect(plays.getByLabel("Rated 4.5 out of 5")).toBeVisible();
  await expect(plays.getByRole("list").getByText("E2E Console")).toBeVisible();

  await page.getByRole("link", { name: "Diary", exact: true }).click();
  await expect(page).toHaveURL(/\/diary$/);
  await expect(page.getByText("March 2026")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "E2E Log Legends", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("12.5 h")).toBeVisible();

  await page.getByRole("link", { name: "Edit E2E Log Legends log" }).click();
  await expect(page.getByLabel("Rating")).toHaveValue("9");
  await page.getByLabel("Rating").selectOption({ label: "2 stars" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/diary$/);
  await expect(page.getByLabel("Rated 2 out of 5")).toBeVisible();

  await page.getByRole("link", { name: "Edit E2E Log Legends log" }).click();
  await page.getByRole("button", { name: "Delete this log" }).click();
  await expect(page).toHaveURL(/\/diary$/);
  await expect(page.getByText("Nothing logged yet.")).toBeVisible();
});

test("asks signed-out visitors to sign in before opening the diary", async ({
  page,
}) => {
  await page.goto("/diary");
  await expect(page).toHaveURL(/\/sign-in$/);
});
