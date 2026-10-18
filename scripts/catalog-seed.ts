// Full initial catalog sync from IGDB into DATABASE_URL.
// Run with `pnpm catalog:seed`; pass an IGDB id to resume after it.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { syncCatalog } from "../lib/catalog/sync";
import { igdbSourceFromEnv } from "../lib/igdb/source";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new Pool({ connectionString });
try {
  const result = await syncCatalog(drizzle(pool), igdbSourceFromEnv(), {
    after: Number(process.argv[2] ?? 0),
    onPage: ({ games, cursor }) =>
      console.log(`${games} games synced (resume after ${cursor})`),
  });
  console.log(`Done: ${result.games} games.`);
} finally {
  await pool.end();
}
