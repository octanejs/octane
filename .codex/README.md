# Codex references for Octane

Use these repository-local references when operating with Codex or other coding agents.

## Load order

1. `../AGENTS.md`
2. Relevant skill in `../.rulesync/skills/`
3. Owning source/tests

`.rulesync/skills/` is the source. `pnpm rules:generate` writes the per-agent
copies (`.claude/skills/`, `.github/skills/`, `.cursor/skills/`,
`.gemini/skills/`), so Claude Code and Copilot discover them natively. They are
plain markdown either way: read the source directly, or fetch one by name
through the `octane_skill` MCP tool.

## Skills

- React ecosystem/package porting: `../.rulesync/skills/react-library-port/SKILL.md`
- Bug hunting/regression fixing: `../.rulesync/skills/bug-hunter/SKILL.md`
- PR creation: `../.rulesync/skills/create-a-pr/SKILL.md`
- Issue handling: `../.rulesync/skills/handle-issue/SKILL.md`
- Core/compiler/runtime extension: `../.rulesync/skills/octane-core-extend/SKILL.md`
- General triage: `../.rulesync/skills/triage/SKILL.md`
- Performance audit: `../.rulesync/skills/performance-audit/SKILL.md`

## Hard rules

- Do not hand-edit generated agent references (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/`, `.claude/rules/`, `.github/instructions/`). Edit `.rulesync/rules/` and run `pnpm rules:generate`.
- Do not assume React behavior is automatically desired. Check intentional divergences.
- Add failing tests before fixes whenever possible.
- Prefer targeted validation, but report exactly what ran.
