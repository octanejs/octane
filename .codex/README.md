# Codex references for Octane

Use these repository-local references when operating with Codex or other coding agents.

## Load order

1. `../AGENTS.md`
2. `../.ai/project-map.md`
3. Relevant skill in `../.ai/skills/`
4. Owning source/tests

## Skills

- React ecosystem/package porting: `../.ai/skills/react-library-port.md`
- Bug hunting/regression fixing: `../.ai/skills/bug-hunter.md`
- PR creation: `../.ai/skills/create-a-pr.md`
- Issue handling: `../.ai/skills/handle-issue.md`
- Core/compiler/runtime extension: `../.ai/skills/octane-core-extend.md`
- General triage: `../.ai/skills/triage.md`
- Performance audit: `../.ai/skills/performance-audit.md`

## Hard rules

- Do not hand-edit generated agent references (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/project.mdc`). Edit `.rulesync/rules/` and run `pnpm rules:generate`.
- Do not assume React behavior is automatically desired. Check intentional divergences.
- Add failing tests before fixes whenever possible.
- Prefer targeted validation, but report exactly what ran.
