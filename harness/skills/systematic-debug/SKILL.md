---
name: systematic-debug
description: Investigate an unexplained failure or regression by reproducing it and testing a concrete cause. Use when a bug, failing check, or unexpected result needs diagnosis.
---

# Investigate a failure

Read the active task and `harness/PROJECT.md`. Identify the expected result and the observed result.
Preserve the user's unrelated working changes while investigating.

## Establish evidence

- Read the actual error and the relevant execution path.
- Reproduce the failure with the smallest useful command or action; record the environment and result.
- Compare recent changes and a nearby working example when they can explain the difference.
- If reproduction is unreliable, gather evidence about timing, inputs, or component boundaries before changing code.
- Inspect configuration by names and presence; avoid exposing secrets in diagnostics or reports.

## Test a cause

State a specific hypothesis and what observation would support or reject it.
Change one relevant factor at a time so the result remains interpretable.
If the result contradicts the hypothesis, update the explanation rather than accumulating speculative fixes.
When repeated attempts add no evidence, stop changing code and summarize the missing information or reconsider the approach.

## Fix and verify

Apply the smallest change that addresses the supported cause.
Use a regression test when the project's existing tools can capture the failure; otherwise document a reproducible check.
Run the original failing check and relevant nearby checks, then inspect their results.
Record the cause, change, commands, results, and unresolved limitations in `handoff.md`.
Report an external or environmental cause as such; do not claim a code fix when verification remains blocked.
