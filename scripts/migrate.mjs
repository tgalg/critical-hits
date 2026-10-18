// Applies drizzle/ migrations under a Postgres advisory lock, so two
// overlapping deploys cannot both decide the same migration is pending.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Neon pools DATABASE_URL through PgBouncer; session-level advisory locks
// need the direct connection when the Vercel integration provides one.
const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

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
