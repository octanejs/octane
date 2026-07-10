# @octanejs/mcp-server

MCP server for agents working with [Octane](https://github.com/octanejs/octane).

It serves two audiences:

- **Octane users** (any project): skills and tools for bridging React packages
  to Octane, migrating React components to `.tsrx`, understanding Octane's
  intentional divergences from React, and setting up SSR. These work anywhere;
  the skills ship inside this package.
- **Octane maintainers** (the octane monorepo): repo triage, validation
  planning, benchmark and React-test-port automation. These tools register
  only when the server detects an octane monorepo checkout at its root.

## Install

```bash
npm install -g @octanejs/mcp-server
```

For local development inside the octane repository:

```bash
pnpm --filter @octanejs/mcp-server start
```

## MCP transport

The server uses stdio transport.

```json
{
  "mcpServers": {
    "octane": {
      "command": "octane-mcp-server"
    }
  }
}
```

Set `OCTANE_REPO_ROOT` to point the server at an octane checkout (enables the
maintainer tools):

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

## Tools (always available)

### `octane_bridge_react_package`

Scans a React package (by name from `node_modules`, or any source directory by
path) for React API usage and returns an Octane compatibility report: which
APIs map one-to-one, which need rewrites (`forwardRef`, `useDebugValue`,
`lazy`, class components, synthetic `onChange`), whether a framework-agnostic
core can be reused verbatim, whether an official `@octanejs/*` binding already
exists, an overall verdict (`bridgeable`, `bridgeable-with-rewrites`,
`needs-rework`), and a step-by-step plan.

```json
{ "package": "jotai", "projectRoot": "/path/to/my-app" }
```

### `octane_bindings`

Returns the map of React packages with maintained `@octanejs/*` ports
(zustand, tanstack-query, motion, stylex, tanstack-router, lexical,
floating-ui, radix, hook-form, base-ui, recharts, redux, testing-library,
mdx). The map lives in `src/bridge.js` (`KNOWN_BINDINGS`) and its tests derive
the expected set from the workspace manifests, so it cannot silently drift from
the published bindings.

### `octane_skill`

Returns a skill by name. Bundled skills (shipped with this package):

- `bridge-react-package` — the full workflow for porting a React library.
- `migrate-react-component` — React JSX to `.tsrx` conversion reference.
- `react-divergences` — Octane's intentional differences from React.
- `setup-ssr` — server rendering and hydration setup.

When running inside the octane monorepo, the maintainer skills from
`.ai/skills` are also available: `react-library-port`, `bug-hunter`,
`create-a-pr`, `handle-issue`, `octane-core-extend`, `triage`,
`performance-audit`.

## Tools (octane monorepo only)

### `octane_project_map`

Returns `.ai/project-map.md` with package layout, authoritative sources,
invariants, and validation commands.

### `octane_triage_paths`

Classifies repository-relative paths by Octane area (compiler, core runtime,
SSR, ecosystem binding, mcp-server, benchmark, docs, RuleSync source).

### `octane_validate_plan`

Recommends validation commands for changed paths and task kind.

### `octane_scaffold_react_port`

Runs `scripts/scaffold-react-port.mjs` for an upstream React test file and
optionally writes the generated Vitest skeleton to an output file.

### `octane_benchmark`

Runs a known benchmark workspace (`news`, `js-framework`, `recursive-context`,
`signal-favoring`, `dbmon`) or all benchmarks.

### `octane_issue_context`

Uses the GitHub CLI (`gh`) to fetch an issue and returns structured issue
context plus lightweight triage hints. Requires `gh` installed and
authenticated.

## Development

```bash
pnpm --filter @octanejs/mcp-server test
pnpm --filter @octanejs/mcp-server start
```
