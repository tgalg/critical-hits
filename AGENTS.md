
<!-- dual-agent-harness:v1 -->
# Shared development instructions

These instructions apply to Codex and Claude Code in this repository.
Read `harness/PROJECT.md` for project context, commands, and local conventions.
Treat fields marked `UNKNOWN` as missing information; inspect the repository before filling them.

## Scope and execution

- Follow the user's task and existing repository conventions. Keep changes focused.
- Inspect the working tree before editing. Preserve unrelated work and report overlapping changes.
- Use the shell actually available. On Windows, quote paths and avoid assuming Bash commands work in PowerShell.
- Use documented project commands after checking their definitions. Do not execute placeholder commands.
- Match planning and testing effort to the change; trivial changes do not require a design ceremony or fixed TDD process.
- Never claim a check passed unless you ran it and inspected its result. Distinguish failures from checks you could not run.
- Do not commit, push, merge, deploy, install global tools, or change account configuration unless the user explicitly asks.

## Task coordination

- The harness commands are `init`, `doctor`, `task`, `build`, `review`, `sync-skills`, and `status`; consult its help for arguments.
- A task lives in `.harness/tasks/<slug>/`. Read `task.md`, `task.json`, and any existing `handoff.md` before working on it.
- `task.json` records the task's base commit. Preserve that reference so reviews can compare the complete task change.
- Run one builder at a time in a checkout. Never bypass a build lock or edit concurrently with another builder.
- Codex is the default builder and Claude the default reviewer; either model can perform either role when selected.
- The builder owns implementation and verification. Record the final change, evidence, open questions, and remaining work in `handoff.md`.
- Reviewers inspect independently and return findings. They do not edit source, apply fixes, or launch another builder.
- Review reports belong in `.harness/tasks/<slug>/reviews/`; let the harness save captured review output there.
- Fix substantive review findings, then run the affected checks again. Explain disagreements with evidence.

## Skills and handoff

- Canonical skill sources live in `harness/skills/`. Use `sync-skills` to update their discovery copies in `.agents/skills/` and `.claude/skills/`.
- Use `plan-task` for substantial task preparation, `systematic-debug` for unexplained failures, `verify-change` before completion claims, and `review-change` for independent review.
- Keep acceptance criteria and important decisions in task files so the next model can continue without chat history.
- If a review session disables automatic instruction loading, use the shared instructions and review skill supplied explicitly in its prompt.
