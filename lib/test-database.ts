import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Database tests run only against a disposable database whose name ends in
// _test, because they drop and recreate its schema.
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
export const hasTestDatabase =
  !!testDatabaseUrl &&
  new URL(testDatabaseUrl).pathname.replace(/^\//, "").endsWith("_test");

if (testDatabaseUrl && !hasTestDatabase) {
  throw new Error("TEST_DATABASE_URL must name a database ending in _test.");
}

export function openTestDatabase() {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  return { pool, db: drizzle(pool) };
}

export async function resetTestDatabase(
  pool: Pool,
  db: ReturnType<typeof drizzle>,
) {
  await pool.query(
    "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
  );
  await migrate(db, { migrationsFolder: "./drizzle" });
}
