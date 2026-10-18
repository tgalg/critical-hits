# Project context

Edit this file with facts verified from this repository. Both models read it.
`UNKNOWN` means not established; it is never a command to execute or a fact to infer.

> Status: the scaffold provides the application and tooling below. See the scaffold task handoff for verification evidence and remaining environment limitations.

## Purpose and architecture

- Product and intended users: Critical Hits, a Letterboxd-style social diary for video games. Players log games they play, rate and review them, build lists, keep a backlog, and follow friends. The MVP is a responsive web app.
- Main language and framework: TypeScript (strict) with Next.js 16 App Router and React 19. Styling with Tailwind CSS 4 and manually initialized shadcn/ui (New York style). Package manager pnpm 12.14.0, pinned in `package.json`; Node 22.13+ within the 22 LTS line.
- Entry points and important directories: `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`; `components/ui/` for UI primitives; `lib/utils.ts` for class utilities; `lib/db/` for the lazy server-only database connection, the MVP schema, and its database tests; `drizzle/` for migrations; `e2e/` for browser tests; `.github/workflows/ci.yml` for CI.
- Data storage and external services: PostgreSQL 17 (Docker locally via `docker compose`), accessed through Drizzle ORM's node-postgres driver with drizzle-kit migrations. The MVP schema (users, games, platforms, logs, reviews, lists, backlog, follows, likes, activities, reports) lives in `lib/db/schema.ts`; migrations are in `drizzle/`. `users.id` is text so Better Auth can map its user model onto it. Better Auth 1.7 (`lib/auth.ts`) handles email or username sign-in with a password and optional Discord OAuth, storing sessions, accounts and verifications in Postgres; routes are `/api/auth/*`, `/sign-up`, `/sign-in` and `/account`. The catalog is filled from IGDB through the `CatalogSource` interface (`lib/catalog/source.ts`, implemented in `lib/igdb/`); `lib/catalog/sync.ts` upserts by IGDB id, `pnpm catalog:seed` runs a full sync, and Vercel Cron calls `/api/cron/igdb-sync` nightly to sync recent changes and continue a resumable backfill (cursor in `sync_cursors`). Logging lives in `lib/logs/` (validation in `input.ts`, transactional writes in `service.ts`) with server actions in `app/logs/actions.ts`; pages are the game page's "Your plays" and "Reviews" sections, `/diary` and `/logs/<id>/edit`. A log's optional review is written in the same transaction as the log; clearing the text deletes it along with its likes and `reviewed` activity. Game averages (`games.avg_rating`, `rating_count`) are recomputed on every log write from each player's latest rated log, under a row lock on the game. The backlog lives in `lib/backlog/` with actions in `app/backlog/actions.ts` and the page at `/backlog`; its writes lock the player's user row. Lists live in `lib/lists/` with actions in `app/lists/actions.ts` and pages at `/lists` and `/lists/<id>`; their writes lock the list row, and deleting a list removes its likes and activities by hand. Profiles live in `lib/profile/` with actions in `app/account/actions.ts`; the public page is `/u/<username>` (case-insensitive) and `/account` edits username, display name and bio. Follows, player search (`/players`) and the home feed (`/` when signed in) live in `lib/social/` with actions in `app/players/actions.ts`; the feed joins each activity's object by type and skips missing, hidden or private ones. Likes (`lib/social/likes.ts`) lock their target while writing, a trigger on `likes` keeps `reviews.like_count` in step (cascades included), and deletes remove a review or list before its likes, so a like can't outlive its target. Moderation lives in `lib/moderation/` with actions in `app/admin/actions.ts`: players report reviews (`reports`, one per player per review), and moderators named in `ADMIN_EMAILS` with a verified email hide, dismiss or restore them at `/admin`, which is a 404 for everyone else. `lib/limits.ts` caps reviews, lists and reports per hour (lower for accounts under a day old), checked inside the writes; tests that need many posts insert rows directly. `users.backlog_public` hides a backlog from everyone but its owner. Top genres are not shown yet because the catalog stores no genres. E2E specs sign up through `e2e/sign-up.ts`, which waits out Better Auth's sign-up rate limit. The app is deployed on Vercel with a Neon Postgres database.
- Supported operating systems and shell: Windows with PowerShell for local development; CI on GitHub Actions.
- Milestones: 1 Foundations (repo, CI, auth, schema, deploy), 2 Catalog (IGDB sync, search, game page), 3 Logging, 4 Social content, 5 Social graph, 6 Launch prep.
- Agent roles: Codex builds and Claude reviews by default; swap roles (Claude builds, Codex reviews) for schema and auth tasks.

## Development commands

Replace each `UNKNOWN` only after inspecting scripts, manifests, CI configuration, or project documentation.
Record the exact command, the directory it runs from, and any required setup.
Use `N/A` with a reason when a check does not apply. Never invent a passing check.

| Purpose | Command | Working directory / prerequisites |
| --- | --- | --- |
| Install dependencies | `pnpm install` (CI: `pnpm install --frozen-lockfile`) | Repository root; Node 22.13+ and pinned pnpm; `corepack pnpm` works without a pnpm PATH shim |
| Start local development | `pnpm dev` | Repository root; `.env` from `.env.example` and `docker compose up -d db` for database work; placeholder page does not need the database |
| Run targeted tests | `pnpm vitest run <path>` | Repository root; database tests (`*.db.test.ts`) run only when `TEST_DATABASE_URL` names a database ending in `_test` (see `.env.example`) and are skipped otherwise |
| Run the relevant test suite | `pnpm test` then `pnpm e2e` | Repository root; run `pnpm exec playwright install chromium` once; e2e starts Next.js on `127.0.0.1:3100` |
| Check types | `pnpm typecheck` | Repository root |
| Lint or format check | `pnpm lint` | Repository root; ESLint plus Prettier; `pnpm format` applies formatting |
| Build | `pnpm build` | Repository root; no database or environment variables needed for the placeholder |
| Combined checks | `pnpm check` | Repository root; lint, typecheck, Vitest, production build; browser test is separate |
| Generate migrations | `pnpm db:generate` | Repository root; `DATABASE_URL` in `.env`; generated SQL belongs in `drizzle/` |
| Apply local migrations | `pnpm db:migrate` | Repository root; local database running and `DATABASE_URL` in `.env`. `drizzle/0000_init.sql` enables `pg_trgm` for game title search |

## Conventions and boundaries

- Existing style and architecture references: `eslint.config.mjs` uses Next.js core-web-vitals and TypeScript presets plus Prettier compatibility. `.prettierrc.json` uses double quotes, semicolons, trailing commas, and LF; `.gitattributes` preserves LF on Windows. `components.json` and `app/globals.css` initialize shadcn CSS variables and `@/` aliases. pnpm's `verifyDepsBeforeRun: false` keeps checks from implicitly installing; `allowBuilds` explicitly permits native dependency setup for esbuild, sharp, and unrs-resolver. Existing harness files are excluded from app formatting and lint rules.
- Generated files and their source: `next-env.d.ts` and `.next/` are generated by Next.js and ignored; `*.tsbuildinfo`, Playwright reports, and coverage are ignored. `next dev` also appends a documentation-rules block to `AGENTS.md`, preserving existing instructions. `pnpm-lock.yaml` is generated by pnpm and tracked. Future Drizzle migrations are generated from `lib/db/schema.ts` via `drizzle.config.ts` and should be reviewed and tracked.
- Deploys: Vercel builds with `pnpm vercel-build` (`scripts/vercel-build.mjs`); production deploys build, then apply migrations to the production database under an advisory lock (`scripts/migrate.mjs`), so a merged migration ships with the code that needs it. Keep migrations backward compatible with the previous release, since it keeps serving until the new deploy goes live.
- Sensitive or externally connected operations: database migrations against non-local databases, Vercel deploys, IGDB API calls, auth provider configuration.
- Environment variables required for local work, by name only: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; optional `TEST_DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (IGDB sync), `CRON_SECRET` (see `.env.example`).
- Known environment limitations, with evidence: This scaffold session verified Node v22.23.2, Corepack 0.34.6, and pnpm 12.14.0 via `corepack pnpm --version`; no pnpm PATH shim or Docker command is installed. Default sandbox npm-registry connections fail with Windows socket permission error 10013; the existing approved Corepack command can download dependencies. Git requires a command-local `-c safe.directory=<repository path>` override for this sandbox user's ownership check; account configuration was not changed. Docker runtime validation remains unavailable until Docker is installed.

## Verification guidance

Choose checks that establish this task's acceptance criteria and exercise its changed behavior.
Use the project's existing tools; do not add a new test framework solely for the harness.
Record commands, results, and limitations in the task's `handoff.md`.
Never place secrets, access tokens, or private account credentials in this file.
