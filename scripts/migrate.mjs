// Applies drizzle/ migrations under a Postgres advisory lock, so two
// overlapping deploys cannot both decide the same migration is pending.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// The session-level advisory lock below only works on a direct connection:
// PgBouncer in transaction mode (Neon's "-pooler" hosts) can run each query on
// a different backend. Use the integration's unpooled URL, and refuse to
// migrate through a pooled one rather than race unprotected.
const connectionString =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
if (new URL(connectionString).hostname.includes("-pooler")) {
  throw new Error(
    "Migrations need a direct database connection; set DATABASE_URL_UNPOOLED.",
  );
}

// Arbitrary constant identifying "critical-hits migrations".
const lockId = 7_243_901;

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock($1)", [lockId]);
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} finally {
  await client.query("SELECT pg_advisory_unlock($1)", [lockId]).catch(() => {});
  await client.end();
}
