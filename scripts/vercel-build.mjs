// Vercel runs this instead of `pnpm build`. Production deploys apply pending
// migrations first, so the database schema always matches the code being
// released; preview deploys never touch the database.
import { execSync } from "node:child_process";

const run = (command) => execSync(command, { stdio: "inherit" });

if (process.env.VERCEL_ENV === "production") {
  run("pnpm exec drizzle-kit migrate");
}
run("pnpm exec next build");
