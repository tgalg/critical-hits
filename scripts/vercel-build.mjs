// Vercel runs this instead of `pnpm build`. Production deploys build first,
// then apply pending migrations, so a failed build never leaves the database
// migrated for code that did not ship. Preview deploys never touch the
// database.
import { execSync } from "node:child_process";

const run = (command) => execSync(command, { stdio: "inherit" });

run("pnpm exec next build");
if (process.env.VERCEL_ENV === "production") {
  run("node scripts/migrate.mjs");
  // One-off data jobs run last, and a failure never fails the deploy: the
  // next deploy tries them again.
  try {
    run(
      "pnpm exec esbuild scripts/one-off-jobs.ts --bundle --platform=node --format=esm --packages=external --log-level=warning --outfile=.next/one-off-jobs.mjs",
    );
    run("node .next/one-off-jobs.mjs");
  } catch {
    console.error("One-off jobs failed; the next deploy runs them again.");
  }
}
