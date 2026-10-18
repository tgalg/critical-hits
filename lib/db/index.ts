import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to the database.");
  }

  return drizzle(new Pool({ connectionString }), { schema });
}

const globalForDatabase = globalThis as typeof globalThis & {
  criticalHitsDatabase?: ReturnType<typeof createDatabase>;
};

export function getDatabase() {
  return (globalForDatabase.criticalHitsDatabase ??= createDatabase());
}
