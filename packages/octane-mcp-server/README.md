# @octanejs/mcp-server

Local MCP server concept/scaffold for Octane-aware coding agents.

The goal is to expose safe, high-value repository operations without needing a human to remember file paths, validation commands, or triage conventions.

## Initial tools

- `octane_project_map` — returns package map, source ownership, validation commands, and skill paths.
- `octane_skill` — returns one of the repository skills from `.ai/skills`.
- `octane_validate_plan` — recommends validation commands for changed paths/task kind.
- `octane_triage_paths` — classifies changed paths by repo area and likely owner.

## Run locally

```bash
pnpm --filter @octanejs/mcp-server start
```

Example moxxy registration after dependencies are installed:

```bash
moxxy mcp add octane --stdio --command pnpm --args --filter,@octanejs/mcp-server,start --cwd /path/to/octane
```

Or register manually as stdio:

- command: `pnpm`
- args: `--filter`, `@octanejs/mcp-server`, `start`
- cwd: repository root

## Future tool ideas

- `octane_run_validation` — guarded execution of targeted tests/typecheck/format.
- `octane_scaffold_react_port` — wrapper around `scripts/scaffold-react-port.mjs`.
- `octane_issue_context` — fetch and classify GitHub issues via `gh`.
- `octane_create_changeset` — guided changeset creation for package changes.
- `octane_benchmark` — run known benchmark harnesses with structured output.
