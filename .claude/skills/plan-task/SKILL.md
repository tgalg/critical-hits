---
name: plan-task
description: Prepare a scoped implementation plan and acceptance criteria for a substantial harness development task. Use before changes that involve several decisions or files.
---

# Plan a development task

Read the user's request, `harness/PROJECT.md`, and the active task's files in `.harness/tasks/<slug>/`.
Inspect the relevant code and existing checks before proposing an approach.

## Define the work

- State the requested outcome in observable terms.
- Identify the affected behavior and likely files; verify paths rather than inventing them.
- List acceptance criteria that a reviewer can check from code, tests, or a reproducible demonstration.
- Record dependencies, significant assumptions, and any question that actually prevents implementation.
- Preserve the base commit already recorded in `task.json`; do not reset it to hide earlier task changes.

## Choose a proportional plan

For a small, clear change, use a brief checklist and proceed within the user's authorization.
For a substantial change, write ordered steps with the purpose, expected changes, and useful verification.
Use existing repository tooling and avoid adding frameworks or global configuration to satisfy the plan.
Clarify only decisions that materially change the outcome; continue independent investigation while they are unresolved.

## Save the context

Keep the task goal, scope, acceptance criteria, and plan in `task.md`.
Use `handoff.md` for progress, decisions, evidence, and remaining work as implementation proceeds.
Leave unrelated files alone and do not start another builder in the same checkout.
A plan authorizes no extra publishing, commits, deployments, or external account changes.
