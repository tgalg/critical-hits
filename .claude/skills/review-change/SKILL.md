---
name: review-change
description: Independently review a harness task against its requirements and base commit, returning actionable findings without editing source. Use when acting as the task's reviewer.
---

# Review a task change

Use the supplied shared instructions, task, and review context even if automatic instruction loading is disabled.
Read `task.md`, `task.json`, `handoff.md`, and `harness/PROJECT.md` when available.
Treat the builder's summary and passing-check claims as evidence to assess, not as the verdict.

## Inspect independently

- Identify the base commit recorded in `task.json` and compare it with the complete current task state.
- Include relevant staged, unstaged, and untracked changes; explain any ambiguity about their ownership.
- Trace changed behavior into its callers, tests, and configuration where necessary to establish a finding.
- Focus on correctness, regressions, missing requirements, and material reliability or security defects.
- Evaluate whether the reported checks exercise the requested behavior and changed failure paths.
- Run only permitted, non-mutating checks. If review permissions prevent a check, report the limitation.
- Do not edit source, install dependencies, apply fixes, commit, or launch another builder during review.

## Return a useful report

For each actionable finding, include severity, file and line when verified, triggering conditions, and the practical consequence.
Explain the evidence and a focused correction; label uncertainty instead of presenting a guess as a defect.
Distinguish task defects from pre-existing issues and optional style preferences.
If no actionable findings are established, say so and still state the review scope and verification limits.
Summarize unmet acceptance criteria and the checks actually inspected or run.
Return the report to the harness for storage in `.harness/tasks/<slug>/reviews/`; do not write application files.
A clean review is a scoped assessment, not proof of every possible behavior or authorization to merge or deploy.
