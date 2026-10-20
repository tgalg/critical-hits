// Data jobs that production deploys run once, after migrations. Each job
// records itself when it succeeds; a job that fails or has nobody to run for
// yet is tried again on the next deploy, and never fails the deploy itself.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { upsertCatalogGames } from "../lib/catalog/sync";
import { oneOffJobs } from "../lib/db/schema";
import { createIgdbClient } from "../lib/igdb/client";
import { fetchIgdbGamesBySlug } from "../lib/igdb/source";
import { moveToEdition, seedPlays, type SeedPlay } from "../lib/import/seed";
import { adminEmails } from "../lib/moderation/admin";
import beatenLogs from "./data/beaten-logs.json";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

// The jobs are for the site owner's own profile. The owner is the first
// moderator in ADMIN_EMAILS.
const [owner] = adminEmails();

const pool = new Pool({ connectionString });
const db = drizzle(pool);

const jobs: Record<string, () => Promise<unknown>> = {
  // The owner's games-beaten history from Notion.
  "beaten-logs": () =>
    seedPlays(db, "2026-10-beaten-logs", owner, beatenLogs as SeedPlay[]),
  // Both of the owner's Dark Souls II runs were Scholar of the First Sin,
  // which the catalog's sync leaves out, so it's added from IGDB first.
  sotfs: async () => {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    const [ran] = await db
      .select()
      .from(oneOffJobs)
      .where(eq(oneOffJobs.name, "2026-10-sotfs"));
    if (!ran && clientId && clientSecret) {
      const client = createIgdbClient({ clientId, clientSecret });
      await upsertCatalogGames(
        db,
        await fetchIgdbGamesBySlug(client, [
          "dark-souls-ii-scholar-of-the-first-sin",
        ]),
      );
    }
    return moveToEdition(db, "2026-10-sotfs", owner, {
      from: "dark-souls-ii",
      to: "dark-souls-ii-scholar-of-the-first-sin",
      addFinishedOn: "2026-09-13",
    });
  },
};

try {
  if (!owner) {
    console.log("one-off jobs: skipped, ADMIN_EMAILS is empty.");
  } else {
    for (const [name, run] of Object.entries(jobs)) {
      try {
        console.log(`${name}:`, JSON.stringify(await run()));
      } catch (error) {
        console.error(`${name} failed; the next deploy runs it again.`, error);
      }
    }
  }
} finally {
  await pool.end();
}
