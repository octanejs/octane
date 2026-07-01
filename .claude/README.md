# Claude references for Octane

Start with `../CLAUDE.md`, then use `../.ai/project-map.md` and the task-specific skill files in `../.ai/skills/`.

## Task routing

- Port React-like package to Octane: `.ai/skills/react-library-port.md`
- Find/fix bug: `.ai/skills/bug-hunter.md`
- Create PR: `.ai/skills/create-a-pr.md`
- Handle GitHub issue: `.ai/skills/handle-issue.md`
- Extend runtime/compiler/core: `.ai/skills/octane-core-extend.md`
- Triage unknown work/failure: `.ai/skills/triage.md`
- Audit performance: `.ai/skills/performance-audit.md`

## Repository reminders

- Octane is compiler-first and React-shaped, not React runtime-compatible.
- `.tsrx` fixtures are preferred for UI behavior tests.
- Existing differential harness compares final `innerHTML`; use conformance tests for lifecycle/render-count/ref timing.
- RuleSync owns generated agent docs.
