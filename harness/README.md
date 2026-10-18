# Dual-agent development starter

A reusable Windows starter for using **Codex and Claude Code together in any Git repository**. One model implements and verifies a task; the other independently reviews it. Either can fill either role.

The harness calls your installed CLIs with their existing authentication. There is no SDK, model router, direct API client, or additional npm dependency. Set a model in `harness/config.json` if you want to pin it; otherwise the CLI chooses. Claude's restricted review ignores user/project settings, so its model can differ from your interactive default.

## Start on Windows

Requirements: Git, Node.js 18 or newer (a current LTS release is preferable), and both signed-in CLIs. PowerShell 5.1 or 7 works with the optional wrapper. You can always use `node` directly without changing PowerShell execution policy.

Extract this starter into a convenient location. From its folder, point the initializer at an existing repository:

```powershell
# Preview all file changes first. Replace this with your repository root.
node .\harness.mjs init --repo "C:\src\my-project" --dry-run
node .\harness.mjs init --repo "C:\src\my-project"

Set-Location "C:\src\my-project"
node .\harness\harness.mjs doctor
```

For a brand-new project, first create a repository with `git init "C:\src\my-project"`. A first commit is not required to create a task.

Fill in `harness/PROJECT.md` with the repo's purpose and commands. Ask either model to inspect the repo and populate it with verified facts. There is no assumed language, package manager, framework, or test command.

The initializer preserves existing `AGENTS.md`, `CLAUDE.md`, and `.gitignore` content, appending the shared workflow/import/ignore rule once. It preserves your `harness/PROJECT.md`, config, and canonical skill edits on reruns. It refuses conflicting harness implementation files or skill discovery copies before making any changes. It is intended as a starter installer, not an upgrade manager.

Review the setup diff and commit it when you want it available on other branches or machines. The harness does not commit on your behalf.

## First development task

```powershell
node .\harness\harness.mjs task --name export-csv --text "Add CSV export. Export only the filtered rows, preserve Unicode, and cover empty results."

# Codex is the default builder. This opens an interactive terminal session.
node .\harness\harness.mjs build --task export-csv

# Exit the builder session when its work and handoff are ready.
# Claude independently inspects the task, diff, source, and supplied evidence.
node .\harness\harness.mjs review --task export-csv

# Read the report, then ask the builder to address substantive findings.
# The next build prompt points it to the latest successful review report.
node .\harness\harness.mjs build --task export-csv
node .\harness\harness.mjs status --task export-csv
```

For long or multiline briefs, use `task --name export-csv --file "C:\notes\export-brief.md"`. Edit the resulting `task.md` to refine acceptance criteria. Task names are lowercase letters, numbers, and hyphens.

Swap roles when it helps:

```powershell
node .\harness\harness.mjs build --task export-csv --agent claude
node .\harness\harness.mjs review --task export-csv --agent codex
```

Use one builder/reviewer cycle for meaningful changes. Extra rounds are useful when there are substantive findings; simple edits do not need both models. Model agreement is not a substitute for passing checks and checking the actual behavior.

## What gets installed

```text
your-repo/
  AGENTS.md                       shared development instructions
  CLAUDE.md                       imports @AGENTS.md
  harness/
    harness.mjs                   dependency-free CLI coordinator
    harness.ps1                   optional PowerShell entry point
    config.json                   roles, executable paths, optional model IDs
    PROJECT.md                    repo-specific facts and commands
    skills/                       canonical, editable skill sources
      plan-task/SKILL.md
      systematic-debug/SKILL.md
      verify-change/SKILL.md
      review-change/SKILL.md
    templates/                    starter files for initializing another repo
    README.md
    SOURCES.md
  .agents/skills/                  Codex discovery copies
  .claude/skills/                  Claude discovery copies
  .harness/                       ignored local task history and lock
    tasks/export-csv/
      task.md
      task.json                   base commit and CLI run records
      handoff.md                  builder's changes, checks, remaining work
      reviews/<timestamp>-<agent>/
        prompt.md
        diff.patch
        review.md
        stderr.log
```

Codex reviews also save `stdout.log`; their final report is `review.md`.

Root instructions stay language-neutral. For a monorepo, add nested instructions such as `apps/web/AGENTS.md` and `services/parser/AGENTS.md` with their specific commands and conventions. Codex has directory-based instruction precedence. Claude's behavior depends on version; use a local `CLAUDE.md` containing `@AGENTS.md` in specialized folders when needed, and verify which instructions the session loads. See [instruction documentation in SOURCES.md](SOURCES.md).

Tasks and reviews are local and ignored by Git. Copy a useful decision into maintained project documentation when it should survive a fresh clone. Global tool preferences and account settings stay under your control.

## Skills

The four included skills are short, original, self-contained instructions. `plan-task` prepares substantial work, `systematic-debug` guides an unexplained failure, `verify-change` records evidence, and `review-change` produces concrete findings. They do not impose a fixed design approval or TDD process on every edit.

Edit the canonical files in `harness/skills/`, then sync both tools:

```powershell
node .\harness\harness.mjs sync-skills --dry-run
node .\harness\harness.mjs sync-skills
```

You can add your own named skill folders to `harness/skills/`. Sync copies their contents into both discovery locations, replacing matching files. It does not delete removed files or touch other skill names. Keep portable instructions in `SKILL.md`; check platform requirements before adding scripts or upstream skills. No administrator privileges, junctions, or symlinks are required.

## Finding the CLIs and signing in

`doctor` checks executable discovery and versions. It does not run a model or verify your account entitlement. The desktop apps bundle their own CLIs in versioned folders (for example `%APPDATA%\Claude\claude-code\<version>\<id>\claude.exe` and `%LOCALAPPDATA%\OpenAI\Codex\bin\<id>\codex.exe`). Those folders change when the app updates, so prefer a standalone install on PATH, or `~\.local\bin\claude.exe`, which the harness finds automatically.

Check authentication in your terminal:

```powershell
codex login status
claude auth status --text
```

If needed, use `codex login` and `claude auth login` with the accounts that give you access. Follow the current [Codex CLI](https://learn.chatgpt.com/docs/codex-cli) and [Claude Code setup](https://code.claude.com/docs/en/overview) documentation if a CLI is missing. Installations and sign-in are intentionally left for your own terminal because they may require account interaction.

If a tool is installed outside PATH, set an absolute executable path in `harness/config.json`:

```json
{
  "version": 1,
  "builder": "codex",
  "reviewer": "claude",
  "tools": {
    "codex": { "command": "codex", "prefixArgs": [], "model": null },
    "claude": {
      "command": "C:\\Users\\yourname\\.local\\bin\\claude.exe",
      "prefixArgs": [],
      "model": null
    }
  },
  "reviewMaxTurns": 40
}
```

Each Read/Glob/Grep call uses a Claude review turn. When a review hits the limit it fails and the harness tells you to raise `reviewMaxTurns`.

Paths with spaces are supported. Relative executable paths resolve from the target repository. Known npm shims are launched through their package's Node entry point; unknown `.cmd`/`.bat` launchers are rejected instead of building a shell command. For another launcher, set `command` to `node` and put an absolute CLI script path in `prefixArgs`.

For subscription-based use, be aware that existing API-key/provider environment variables can change how a CLI authenticates or bills. `doctor` lists relevant variable **names only**. The harness neither reads credential files nor changes your authentication environment. Claude's print mode gives `ANTHROPIC_API_KEY` precedence when present; see [authentication precedence](https://code.claude.com/docs/en/authentication#authentication-precedence).

## Execution and review behavior

- Builders run interactively. Codex gets the workspace-write sandbox and on-request approval policy. Claude starts in its default permission mode. You can approve necessary operations in the session.
- Review is noninteractive, with a 15-minute limit. Claude gets safe/restricted modes and only `Read`, `Glob`, and `Grep`; MCP tools are denied. Because safe mode disables automatic instruction/skill loading, the harness explicitly includes the shared instructions, project context, and review skill. Current Claude Code is required; unsupported flags fail without a weaker retry.
- Codex review gets the read-only shell sandbox and never requests escalations. That limits shell filesystem writes; it is not full isolation from configured plugins, MCP integrations, or host-side hooks. Use your normal trusted CLI configuration for this starter.
- Neither reviewer is asked to run project code. The builder runs tests, and the reviewer checks the evidence. Source inspection and a successful CLI exit do not prove the change is correct.
- Build and review share an exclusive checkout lock so harness sessions do not overlap. Manually opened agent sessions and editors do not honor this lock. Use separate Git worktrees for concurrent development.
- Nonzero CLI exits, timeouts, and missing final reports fail the command. Partial output remains for diagnosis. There are no automatic model retry loops, fixes, commits, pushes, or deployments.
- Git output settings that would change review input (`core.quotePath`, `color.*`, diff prefixes) are pinned for every harness Git call. Diffs stream straight to `diff.patch`, so large changes don't hit a memory limit; only the inline prompt copy is truncated.

### Review integrity

When you create a task, the harness records the base commit, the original brief, copies of `AGENTS.md` and the review skill, a hash of `harness/harness.mjs`, and the configured CLI commands. They are stored in Git's own directory (`.git/dual-agent-harness/`), outside the working tree that builders edit.

At review time:

- The diff uses the recorded base, even if `task.json` was edited. The reviewer is told about the edit.
- The reviewer gets the recorded `AGENTS.md` and review skill. Later edits are flagged and still appear in the diff.
- If `task.md` no longer contains the original brief, the reviewer gets both versions.
- If `harness/harness.mjs` or the reviewer's `command`/`prefixArgs` changed, review is refused. If you made the change deliberately, rerun with `--allow-harness-changes`.

This catches accidental or naive tampering, not a determined one. A builder with unrestricted shell access can edit `.git` or the harness itself. Keep builders sandboxed, and read the diff of harness files. Tasks created by older versions have no record; their reviews proceed with a warning.

Reviews compare tracked files to the commit recorded when the task was created, including any later commits and working-tree edits. For an unborn repo, staged and unstaged diffs are supplied separately; if you make the first commit before review, its tracked tree is included using an empty-tree comparison. Untracked filenames are listed and the reviewer is asked to inspect relevant files; Git does not include their contents in the diff. A long inline diff is marked as truncated, with the complete `diff.patch` available to read. Binary changes require an appropriate separate verification method.

If the checkout is dirty when you create a task, the harness records it and warns that the review includes those changes too. Use a clean task branch or worktree when you need separate attribution. A base commit is a comparison point, not an automatic snapshot or rollback mechanism.

The selected provider receives your task, instructions, diff, and any files its CLI reads. This has the same data boundary as using that provider's coding CLI directly.

## Optional open-source additions

[Superpowers](https://github.com/obra/superpowers) is the best-fitting optional development methodology found during research. It is MIT-licensed and supports both tools through native plugins. It adds a more opinionated approach to planning, testing, debugging, review, and worktrees.

Current installation paths from its README:

- Claude Code: `/plugin install superpowers@claude-plugins-official`
- Codex app: Plugins, search Superpowers, install.
- Codex CLI: `/plugins`, search `superpowers`, install.

Install separately for each tool. Try it after the basic workflow works; inspect overlap with these four local skills. Install the full plugin rather than copying isolated skill files that depend on its other skills.

[agentsmd/agents.md](https://github.com/agentsmd/agents.md) supplies the shared instruction format and examples. [intellectronica/ruler](https://github.com/intellectronica/ruler) is an optional later rule/skill synchronization layer if you manage many repositories. It is not required here. The old [openai/skills](https://github.com/openai/skills) repository currently points to [openai/plugins](https://github.com/openai/plugins); check the maintained catalog for new additions.

No third-party framework is downloaded or executed by this starter. Sources and license notes are in [SOURCES.md](SOURCES.md).

## Troubleshooting and tests

```powershell
node .\harness\harness.mjs help
node .\harness\harness.mjs build --task export-csv --dry-run
node .\harness\harness.mjs review --task export-csv --dry-run
node .\harness\harness.mjs status
```

Dry runs show invocation/file plans and do not create task or review files, acquire a session lock, or launch a model. `init --dry-run` can still report a file conflict that needs your attention.

If a wrapper crashes, inspect `.harness/session.lock`. Only remove that file after confirming the recorded session and its child agent have stopped. Locks are intentionally not stolen automatically.

Run the starter's integration suite from the extracted starter directory:

```powershell
node --test .\tests\harness.test.mjs
```

Tests use temporary local Git repositories and fake CLIs; they do not consume model usage. Live authenticated model calls must be checked after both CLIs are available and signed in on your machine.
