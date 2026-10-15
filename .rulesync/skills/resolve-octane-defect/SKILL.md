---
targets: ['*']
name: resolve-octane-defect
description: Resolve a defect discovered in Octane or an Octane library while working on another task. Choose an owner-level fix PR or actionable issue instead of a consumer workaround.
---

# Resolve an Octane defect

Use this when work in a consumer exposes a defect in Octane or an Octane
library. Establish that the behavior is a defect and identify the package and
repository that own it; use `bug-hunter` for diagnosis and `triage` if ownership
is unclear.

- If the correct fix is understood and fits the task, reuse an existing fix PR
  or fix the owning source, add regression coverage there, and open a PR. Link
  any existing issue and retain the consumer scenario as integration evidence.
  Use `create-a-pr` for this repository; follow the owning repository's
  instructions elsewhere.
- Otherwise, reuse an existing issue or create one in the owning repository with the
  affected package/version, expected and actual behavior, a minimal reproduction
  or the best available evidence, and why the fix remains open. Label an
  agent-filed Octane issue `agent-authored`, as described in `handle-issue`.
  Keep private consumer code and data out of public reports.

Link the issue or PR from the original work and state what remains blocked. Do
not substitute a consumer workaround for the owner-level fix or issue.
