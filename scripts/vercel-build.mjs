// Vercel runs this instead of `pnpm build`. Production deploys build first,
// then apply pending migrations, so a failed build never leaves the database
// migrated for code that did not ship. Preview deploys never touch the
// database.
import { execSync } from "node:child_process";

const run = (command) => execSync(command, { stdio: "inherit" });

run("pnpm exec next build");
if (process.env.VERCEL_ENV === "production") {
  run("node scripts/migrate.mjs");
}
