import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

// Load .env so the auth tests see DATABASE_URL, as the dev server does.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env: database-backed tests skip themselves.
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build: the dev server's on-demand compiles reload open
    // pages when tests run in parallel, which breaks multi-step flows.
    command:
      "node node_modules/next/dist/bin/next build && node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    // Auth must trust the test server's origin whatever .env says, and the
    // moderation spec signs in as this moderator.
    env: { BETTER_AUTH_URL: baseURL, ADMIN_EMAILS: "moderator@e2e.test" },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
