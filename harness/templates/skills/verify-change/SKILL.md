---
name: verify-change
description: Verify a task's changed behavior and record concrete evidence before claiming completion or handing work to another model. Use after implementation or review fixes.
---

# Verify a change

Read `task.md`, the base reference in `task.json`, and `harness/PROJECT.md`.
Inspect the full task change and the current working tree, including relevant untracked files.

## Select useful checks

- Map the acceptance criteria to checks that can establish the requested behavior.
- Use commands verified from project documentation, manifests, scripts, or CI; `UNKNOWN` is not executable.
- Cover the original failure for a bug fix and relevant boundary cases for changed logic.
- Reuse existing tests and tools. For documentation or simple configuration edits, a focused inspection may be sufficient.
- Include broader tests, lint, types, or builds when their coverage is relevant to the change.

## Run and inspect

Run the chosen checks against the current files and inspect the exit status and meaningful output.
After any further edits, rerun the checks whose conclusions may have changed.
Separate a failing product check from a missing dependency, unavailable service, or unrelated baseline failure.
Do not substitute a model's confidence or another model's report for verification evidence.

## Record the handoff

Update `handoff.md` with the requested outcome, implementation summary, affected files, and decisions.
For each check, record the exact command or action, working directory, result, and useful evidence.
List checks not run and why, remaining risks, and unfinished acceptance criteria.
State completion only to the extent supported by this evidence; otherwise describe the precise remaining gap.
Leave commits, pushes, merges, and deployments to an explicit user request.
