import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./sign-up";

// Needs the app's database (DATABASE_URL, migrated); seeds one game directly.
// The test server lists moderator@e2e.test in ADMIN_EMAILS.
test.skip(!process.env.DATABASE_URL, "needs a migrated database");

const slug = "e2e-moderation-game";
const moderatorEmail = "moderator@e2e.test";

const query = async (text: string, values: unknown[]) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(text, values);
  } finally {
    await pool.end();
  }
};

test.beforeAll(async () => {
  await query(
    `INSERT INTO games (igdb_id, slug, title) VALUES (900000051, $1, 'E2E Moderation Game')
     ON CONFLICT (igdb_id) DO UPDATE SET title = excluded.title`,
    [slug],
  );
  // The moderator account is recreated each run.
  await query("DELETE FROM users WHERE email = $1", [moderatorEmail]);
});

test("reports a review and a moderator hides it", async ({ browser }) => {
  const stamp = Date.now();
  const spammerName = `spammer${stamp}`;
  const spammer = await browser.newPage();
  await signUp(spammer, spammerName);
  await spammer.goto(`/games/${slug}`);
  await spammer
    .getByRole("textbox", { name: "Review" })
    .fill(`Cheap gold at example.com ${stamp}`);
  await spammer.getByRole("button", { name: "Save log" }).click();
  await expect(spammer.getByRole("status")).toHaveText("Logged.");
  // Players can't report their own review.
  await expect(spammer.getByText("Report", { exact: true })).toHaveCount(0);

  const reporter = await browser.newPage();
  await signUp(reporter, `reporter${stamp}`);
  await reporter.goto(`/games/${slug}`);
  const reviews = reporter.getByRole("region", { name: "Reviews" });
  const review = reviews.getByRole("listitem").filter({ hasText: spammerName });
  await review.getByLabel(`Report ${spammerName}'s review`).click();
  await review.getByLabel("Reason").selectOption({ label: "Spam" });
  await review.getByRole("button", { name: "Send report" }).click();
  await expect(review.getByRole("status")).toHaveText(
    "Thanks. A moderator will take a look.",
  );

  // Moderation is invisible to other players.
  const response = await reporter.goto("/admin");
  expect(response?.status()).toBe(404);
  await reporter.close();

  const moderator = await browser.newPage();
  await signUp(moderator, `mod${stamp}`, moderatorEmail);
  // An unverified address isn't trusted as the moderator's.
  expect((await moderator.goto("/admin"))?.status()).toBe(404);
  await query("UPDATE users SET email_verified = true WHERE email = $1", [
    moderatorEmail,
  ]);
  await moderator.goto("/account");
  await moderator.getByRole("link", { name: "Moderation" }).click();
  const queued = moderator
    .getByRole("listitem")
    .filter({ hasText: `Cheap gold at example.com ${stamp}` });
  await expect(queued).toContainText("1 report: Spam.");
  await queued
    .getByRole("button", {
      name: `Hide ${spammerName}'s review of E2E Moderation Game`,
    })
    .click();
  await expect(
    moderator
      .getByRole("region", { name: "Hidden reviews" })
      .getByText(`Cheap gold at example.com ${stamp}`),
  ).toBeVisible();
  await moderator.goto(`/games/${slug}`);
  await expect(
    moderator.getByText(`Cheap gold at example.com ${stamp}`),
  ).toHaveCount(0);
  await moderator.close();

  // The author is told on their log.
  await spammer.goto("/diary");
  await spammer
    .getByRole("link", { name: "Edit E2E Moderation Game log" })
    .click();
  await expect(spammer.getByText("A moderator hid your review")).toBeVisible();
  await spammer.close();
});
