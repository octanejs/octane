# @octanejs/mcp-server

MCP server for Octane-aware coding agents.

It exposes repository-specific context, skills, triage helpers, validation planning, and selected automation wrappers so agents can work on Octane without re-discovering package ownership, test harnesses, or common workflows.

## Install

```bash
npm install -g @octanejs/mcp-server
```

For local development inside this repository:

```bash
pnpm --filter @octanejs/mcp-server start
```

Set `OCTANE_REPO_ROOT` when the server is launched outside the repository root:

```bash
OCTANE_REPO_ROOT=/path/to/octane octane-mcp-server
```

## MCP transport

The server uses stdio transport.

Generic client configuration:

```json
{
  "mcpServers": {
    "octane": {
      "command": "octane-mcp-server",
      "env": {
        "OCTANE_REPO_ROOT": "/path/to/octane"
      }
    }
  }
}
```

Local workspace configuration:

```json
{
  "mcpServers": {
    "octane": {
      "command": "pnpm",
      "args": ["--filter", "@octanejs/mcp-server", "start"],
      "cwd": "/path/to/octane"
    }
  }
}
```

## Tools

### `octane_project_map`

Returns `.ai/project-map.md` with package layout, authoritative sources, invariants, and validation commands.

### `octane_skill`

Returns one of the repository-local skills from `.ai/skills`:

- `react-library-port`
- `bug-hunter`
- `create-a-pr`
- `handle-issue`
- `octane-core-extend`
- `triage`
- `performance-audit`

### `octane_triage_paths`

Classifies repository-relative paths by Octane area, such as compiler, core runtime, SSR, ecosystem binding, benchmark, docs, or RuleSync source.

### `octane_validate_plan`

Recommends validation commands for changed paths and task kind.

### `octane_scaffold_react_port`

Runs `scripts/scaffold-react-port.mjs` for an upstream React test file and optionally writes the generated Vitest skeleton to an output file.

Input:

```json
{
  "reactTestFile": "../react/packages/react-reconciler/src/__tests__/ReactHooks-test.js",
  "outFile": "packages/octane/tests/conformance/react-hooks-ported.test.ts"
}
```

### `octane_benchmark`

Runs a known benchmark workspace or all benchmarks.

Supported benchmark names:

- `all`
- `news`
- `js-framework`
- `recursive-context`
- `signal-favoring`
- `dbmon`

### `octane_issue_context`

Uses GitHub CLI (`gh`) to fetch an issue and returns structured issue context plus lightweight triage hints. This requires the caller's environment to have `gh` installed and authenticated for the Octane repository.

## Development

```bash
pnpm --filter @octanejs/mcp-server test
pnpm --filter @octanejs/mcp-server start
```
