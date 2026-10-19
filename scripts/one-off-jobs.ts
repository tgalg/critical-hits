// Data jobs that production deploys run once, after migrations. Each job
// records itself when it succeeds; a job that fails or has nobody to run for
// yet is tried again on the next deploy, and never fails the deploy itself.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { seedPlays, type SeedPlay } from "../lib/import/seed";
import { adminEmails } from "../lib/moderation/admin";
import beatenLogs from "./data/beaten-logs.json";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

// The site owner's games-beaten history from Notion, for their own profile.
// The owner is the first moderator in ADMIN_EMAILS.
const [owner] = adminEmails();

const pool = new Pool({ connectionString });
try {
  if (!owner) {
    console.log("beaten-logs: skipped, ADMIN_EMAILS is empty.");
  } else {
    const result = await seedPlays(
      drizzle(pool),
      "2026-10-beaten-logs",
      owner,
      beatenLogs as SeedPlay[],
    );
    console.log("beaten-logs:", JSON.stringify(result));
  }
} finally {
  await pool.end();
}
