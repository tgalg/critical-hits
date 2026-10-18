# Project context

Edit this file with facts verified from this repository. Both models read it.
`UNKNOWN` means not established; it is never a command to execute or a fact to infer.

> Status: planned stack. The commands below become real once the `scaffold` task lands; until then the repository contains only the harness.

## Purpose and architecture

- Product and intended users: Critical Hits, a Letterboxd-style social diary for video games. Players log games they play, rate and review them, build lists, keep a backlog, and follow friends. The MVP is a responsive web app.
- Main language and framework: TypeScript (strict) with Next.js App Router. Styling with Tailwind CSS and shadcn/ui. Package manager pnpm.
- Entry points and important directories: UNKNOWN until scaffold lands (expected Next.js `app/` directory).
- Data storage and external services: PostgreSQL (Docker locally via `docker compose`), accessed through Drizzle ORM with drizzle-kit migrations. Better Auth for authentication (email plus one social provider). IGDB for the game catalog (milestone 2). Hosting on Vercel.
- Supported operating systems and shell: Windows with PowerShell for local development; CI on GitHub Actions.
- Milestones: 1 Foundations (repo, CI, auth, schema, deploy), 2 Catalog (IGDB sync, search, game page), 3 Logging, 4 Social content, 5 Social graph, 6 Launch prep.
- Agent roles: Codex builds and Claude reviews by default; swap roles (Claude builds, Codex reviews) for schema and auth tasks.

## Development commands

Replace each `UNKNOWN` only after inspecting scripts, manifests, CI configuration, or project documentation.
Record the exact command, the directory it runs from, and any required setup.
Use `N/A` with a reason when a check does not apply. Never invent a passing check.

| Purpose | Command | Working directory / prerequisites |
| --- | --- | --- |
| Install dependencies | `pnpm install` | Repository root; Node and pnpm installed |
| Start local development | `pnpm dev` | Repository root; database running via `docker compose up -d db`; `.env` from `.env.example` |
| Run targeted tests | `pnpm vitest run <path>` | Repository root |
| Run the relevant test suite | `pnpm test` then `pnpm e2e` | Repository root; e2e uses Playwright |
| Check types | `pnpm typecheck` | Repository root |
| Lint or format check | `pnpm lint` | Repository root |
| Build | `pnpm build` | Repository root |

## Conventions and boundaries

- Existing style and architecture references: UNKNOWN until scaffold lands (ESLint and Prettier planned).
- Generated files and their source: UNKNOWN until scaffold lands (drizzle-kit migrations expected).
- Sensitive or externally connected operations: database migrations against non-local databases, Vercel deploys, IGDB API calls, auth provider configuration.
- Environment variables required for local work, by name only: `DATABASE_URL` (others to be listed in `.env.example`).
- Known test failures or environment limitations, with evidence: As of 2026-10-17 on the dev machine, Node is v18.16.0 (Next.js 15+ needs >= 18.18, Next 16 needs >= 20.9), pnpm is not installed (corepack 0.17.0 present), and Docker is not installed.

## Verification guidance

Choose checks that establish this task's acceptance criteria and exercise its changed behavior.
Use the project's existing tools; do not add a new test framework solely for the harness.
Record commands, results, and limitations in the task's `handoff.md`.
Never place secrets, access tokens, or private account credentials in this file.
