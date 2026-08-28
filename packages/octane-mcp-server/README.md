# @octanejs/mcp-server

MCP server for agents working with [Octane](https://github.com/octanejs/octane).

It serves two audiences:

- **Octane users** (any project): skills and tools for bridging React packages
  to Octane, engineering production-grade applications and libraries, migrating
  React components to `.tsrx`, understanding Octane's intentional divergences
  from React, and setting up SSR. These work anywhere; the skills ship inside
  this package.
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

The server initialization instructions are one orienting sentence plus a pointer
to `octane_engineering_plan`, because they are injected into every session
whether or not it touches Octane. The correctness, performance-evidence,
self-review, and handoff requirements live in that tool response, so they stay
reachable even on hosts that do not discover skills. Each tool description says
when to call it.

### `octane_engineering_plan`

Returns structured engineering gates for application, library, or
framework-core work. Framework-core plans always require hot-path analysis,
comparable baseline/candidate performance evidence, the maintainer core and
performance skills, a second review of the final diff, and explicit residual
risk reporting. In repo mode, the response also includes validation commands for
the supplied paths. A framework-core request outside repo mode returns a blocking
condition directing the client to configure `OCTANE_REPO_ROOT`, because the
required maintainer skills and repository validation are otherwise unavailable.

```json
{
  "scope": "framework-core",
  "changeKind": "performance",
  "paths": ["packages/octane/src/runtime.ts"]
}
```

### `octane_bridge_react_package`

Scans a React package (by name from `node_modules`, or any source directory by
path) for React API usage and returns an Octane compatibility report: which
APIs map one-to-one, which need rewrites (`forwardRef`, class components,
synthetic `onChange`, `react-dom/server` imports), whether a
framework-agnostic core can be reused verbatim, whether an official
`@octanejs/*` binding already exists, an overall verdict (`bridgeable`,
`bridgeable-with-rewrites`, `needs-rework`), and a step-by-step plan.

```json
{ "package": "jotai", "projectRoot": "/path/to/my-app" }
```

The event scan is host-aware: it recommends `onInput` only for direct standard
text-host wiring that appears to mean “every edit.” It leaves component callbacks,
selects, checkboxes/radios, dynamic input types, and explicitly intentional native
text commits alone.

### `octane_bindings`

Returns the map of React packages with maintained `@octanejs/*` ports. The map
lives in `src/bridge.js` (`KNOWN_BINDINGS`), and its tests derive the complete
binding package set from the workspace manifests, so adding a published binding
without registering its React-package mapping fails CI.

### `octane_skill`

Returns a skill by name. Bundled skills (shipped with this package):

- `bridge-react-package`: the full workflow for porting a React library.
- `build-octane-software`: production engineering, performance, validation,
  and adversarial self-review gates for Octane code.
- `migrate-react-component`: React JSX to `.tsrx` conversion reference.
- `react-divergences`: Octane's intentional differences from React.
- `setup-ssr`: server rendering and hydration setup.

When running inside the octane monorepo, the skills from `.rulesync/skills` are
also available: `authoring-tsrx`, `octane-react-library-port`, `bug-hunter`,
`create-a-pr`, `handle-issue`, `octane-core-extend`, `triage`,
`performance-audit`. A test compares this map against the directory in both
directions, so a new skill cannot stay unreachable here. This tool reads the RuleSync source, and
`pnpm rules:generate` writes the per-agent copies (`.claude/skills/`,
`.github/skills/`, `.cursor/skills/`, `.gemini/skills/`) from the same text, so
hosts that discover skills natively and hosts that call this tool see the same
thing.

## Tools (octane monorepo only)

### `octane_project_map`

Returns `AGENTS.md`: the RuleSync-generated root rule, covering what Octane is,
which source owns which behavior, the intentional divergences from React, and the
validation commands. CI fails if it drifts from its source in `.rulesync/rules/`.

### `octane_triage_paths`

Classifies repository-relative paths by Octane area (compiler, core runtime,
SSR, ecosystem binding, vite-plugin, deploy adapter, evals, website,
mcp-server, benchmark, docs, RuleSync source).

### `octane_validate_plan`

Recommends validation commands for changed paths and task kind. Core task plans
include the quick benchmark ratio gate in addition to core tests, typechecking,
and repository-wide formatting.

### `octane_scaffold_react_port`

Runs `scripts/scaffold-react-port.mjs` for an upstream React test file and
optionally writes the generated Vitest skeleton to an output file.

### `octane_benchmark`

Runs benchmark suites through the unified runner (`node benchmarks/bench.mjs`):
one manifest suite by name (`js-framework`, `todomvc`, `weather-app`,
`hydration-interactivity`, `hydration-stress`, `lifecycle-memory`,
`controlled-form`, `external-store-fanout`, `external-store-integrations`,
`scheduler-responsiveness`, `suspense-recovery`, `event-delegation`,
`application-composition`, `scaling-curves`, `dev-form-diagnostics`,
`behavior-root-events`, `radix-collection-order`, `router-dispatch`,
`floating-tree-navigation`, `manifest-cache-invalidation`, `vite-client-assets`, `activity`,
`streaming-ssr`, `streaming-backpressure`,
`compiler-throughput`, `tsrx-component-graph`, `codegen-size`, `hook-memo`,
`template-call-memo`, `tsrx-renderer-selection`, `bundle-size`, `bundle-reachability`, `three-renderer`,
`three-bundle-size`, …)
or every suite with `all`; `quick` selects the reduced-iteration smoke pass. The
suite list mirrors the runner manifest and `node benchmarks/bench.mjs --list`.

### `octane_issue_context`

Uses the GitHub CLI (`gh`) to fetch an issue and returns structured issue
context plus lightweight triage hints. Requires `gh` installed and
authenticated.

## Development

```bash
pnpm --filter @octanejs/mcp-server test
pnpm --filter @octanejs/mcp-server start
```
