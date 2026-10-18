import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Neon pools DATABASE_URL through PgBouncer; migrations prefer the direct
// connection when the Vercel integration provides one.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env first.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
