# Critical Hits

A social diary for video games, built with Next.js App Router, strict TypeScript,
Tailwind CSS, and shadcn/ui. This first slice provides a placeholder home page and
development tooling, the MVP database schema, and accounts (email or username
with a password, plus optional Discord sign-in). Game data comes later.

## Local setup (PowerShell)

Use Node.js 22 LTS (22.13 or newer) and the pnpm version pinned in `package.json`.
Node 22 includes Corepack; `corepack pnpm` works without installing a global pnpm
shim. If pnpm is already on PATH, use `pnpm` for the commands below.

```powershell
corepack pnpm install
Copy-Item .env.example .env
docker compose up -d db
corepack pnpm db:migrate
corepack pnpm dev
```

Open <http://localhost:3000>. Docker Desktop with Compose is needed for PostgreSQL.
The placeholder page, unit tests, typecheck, and production build work without
Docker or a database. The default local database URL is in `.env.example`; its
credentials are for local development only.

## Commands

Run all commands from the repository root. Prefix `pnpm` with `corepack` if there
is no pnpm shim on PATH.

| Command                             | Purpose                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Start the development server                                                                                                                  |
| `pnpm build`                        | Create the production build                                                                                                                   |
| `pnpm start`                        | Serve an existing production build                                                                                                            |
| `pnpm test`                         | Run the Vitest unit suite once                                                                                                                |
| `pnpm vitest run lib/utils.test.ts` | Run the sample unit test directly                                                                                                             |
| `pnpm test:watch`                   | Watch unit tests                                                                                                                              |
| `pnpm e2e`                          | Run the Chromium browser tests (auth and catalog need a migrated `DATABASE_URL`); builds and starts its own server on port 3100               |
| `pnpm typecheck`                    | Generate Next.js types and run strict TypeScript checks                                                                                       |
| `pnpm lint`                         | Check ESLint rules and Prettier formatting                                                                                                    |
| `pnpm format`                       | Format application and root configuration files                                                                                               |
| `pnpm check`                        | Run lint, typecheck, unit tests, and build                                                                                                    |
| `pnpm db:generate`                  | Generate a Drizzle migration from the schema using `.env`                                                                                     |
| `pnpm db:migrate`                   | Apply generated migrations to `DATABASE_URL`                                                                                                  |
| `pnpm catalog:seed`                 | Full IGDB catalog sync into `DATABASE_URL`; needs `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in `.env`; pass an IGDB id to resume after it |

Install the Playwright browser once before the smoke test:

```powershell
corepack pnpm exec playwright install chromium
corepack pnpm e2e
```

GitHub Actions runs lint, typecheck, unit tests, and build with a frozen lockfile.
The browser tests are run separately and is not part of `pnpm check`.

## Structure and conventions

- `app/`: App Router layout, home page, and Tailwind 4 global CSS.
- `components/ui/`: shadcn/ui primitives; `components.json` records the manual
  initialization (New York style, CSS variables, `@/` aliases).
- `lib/utils.ts`: shared `cn` class utility; `lib/utils.test.ts` is its sample test.
- `lib/db/`: lazy, server-only Drizzle connection and the MVP schema (`schema.ts`),
  with database tests in `schema.db.test.ts`.
- `app/games/`: game search (`/games?q=`, pg_trgm fuzzy match plus substring)
  and game pages (`/games/<slug>`); queries live in `lib/catalog/queries.ts`.
- `lib/catalog/` and `lib/igdb/`: the game catalog. `CatalogSource` is the
  interface a game-data source implements; `lib/igdb/` implements it for IGDB
  (Twitch client-credentials token, 4 requests per second), and
  `lib/catalog/sync.ts` upserts games, platforms and their links by IGDB id.
  Vercel Cron calls `/api/cron/igdb-sync` nightly (`vercel.json`) with
  `Authorization: Bearer $CRON_SECRET` to sync games changed in the last two
  days.
- `lib/auth.ts`: Better Auth server config mapped onto the `users`, `sessions`,
  `accounts` and `verifications` tables; `lib/auth-client.ts` is the browser
  client. The API lives at `app/api/auth/[...all]`, with pages at `/sign-up`,
  `/sign-in` and `/account`. Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in
  `.env`; Discord sign-in turns on only when `DISCORD_CLIENT_ID` and
  `DISCORD_CLIENT_SECRET` are both set.
- `e2e/`: Playwright smoke, auth and catalog tests (auth and catalog need a migrated
  `DATABASE_URL`), isolated from Vitest's `*.test.ts` discovery.
- `drizzle.config.ts`: PostgreSQL migration configuration; requires `DATABASE_URL`.
- `drizzle/`: generated migrations, starting with `0000_init.sql` (which also
  enables `pg_trgm`). Run `pnpm db:migrate` after pulling schema changes, and
  review generated SQL before applying it.
- `harness/`: shared development workflow; see [its README](harness/README.md).

Use strict TypeScript, ESLint's Next.js presets, and Prettier. Next.js generates
`next-env.d.ts` and `.next/`; neither is committed. Local environment files,
dependency directories, and test reports are ignored. The dependency lockfile is
maintained by pnpm. Do not run migrations against non-local databases without
explicit authorization.
