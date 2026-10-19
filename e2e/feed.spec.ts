import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./sign-up";

// Needs the app's database (DATABASE_URL, migrated); seeds one game directly.
test.skip(!process.env.DATABASE_URL, "needs a migrated database");

const slug = "e2e-feed-game";

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `INSERT INTO games (igdb_id, slug, title) VALUES (900000041, $1, 'E2E Feed Game')
     ON CONFLICT (igdb_id) DO UPDATE SET title = excluded.title`,
    [slug],
  );
  await pool.end();
});

test("follows a player found by search, sees and likes their review", async ({
  browser,
}) => {
  const stamp = Date.now();
  const writer = await browser.newPage();
  const writerName = `writer${stamp}`;
  await signUp(writer, writerName);
  await writer.goto(`/games/${slug}`);
  await writer.getByRole("radio", { name: "4 stars" }).check();
  await writer
    .getByRole("textbox", { name: "Review" })
    .fill("Feed-worthy, honestly.");
  await writer.getByRole("button", { name: "Save log" }).click();
  await expect(writer.getByRole("status")).toHaveText("Logged.");
  await writer.close();

  const reader = await browser.newPage();
  await signUp(reader, `reader${stamp}`);
  await reader.goto("/");
  await expect(reader.getByText("Nothing here yet.")).toBeVisible();
  // An empty feed suggests reviews instead, such as the one just written.
  await expect(
    reader.getByRole("region", { name: "Popular reviews" }),
  ).toBeVisible();
  await reader.getByLabel("Find players").fill(writerName);
  await reader.getByRole("button", { name: "Search" }).click();
  await reader.getByRole("link", { name: writerName }).first().click();
  await expect(reader.getByText("0 followers")).toBeVisible();
  await reader.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(reader.getByText("1 follower ·")).toBeVisible();
  await expect(reader.getByRole("button", { name: "Unfollow" })).toBeVisible();

  await reader.goto("/");
  const feed = reader.getByRole("listitem").filter({ hasText: writerName });
  await expect(feed).toHaveCount(1);
  await expect(feed).toContainText("reviewed E2E Feed Game");
  await expect(feed.getByLabel("Rated 4 out of 5")).toBeVisible();
  await expect(feed).toContainText("Feed-worthy, honestly.");

  // Likes count once per player and can be taken back.
  await feed
    .getByRole("button", { name: `Like ${writerName}'s review` })
    .click();
  const unlike = feed.getByRole("button", {
    name: `Unlike ${writerName}'s review`,
  });
  await expect(unlike).toHaveText("♥ 1 like");
  await reader.goto(`/games/${slug}`);
  await expect(
    reader
      .getByRole("region", { name: "Reviews" })
      .getByRole("button", { name: `Unlike ${writerName}'s review` }),
  ).toHaveText("♥ 1 like");
  await reader.goto("/");
  await unlike.click();
  await expect(
    feed.getByRole("button", { name: `Like ${writerName}'s review` }),
  ).toHaveText("♥ 0 likes");
  await reader.close();
});
