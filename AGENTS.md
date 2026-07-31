Please also reference the following rules as needed. The list below is provided in TOON format, and `@` stands for the project root directory.

rules[3]:
  - path: @.agents/memories/core-engineering.md
    description: Performance-first engineering and self-review gates for Octane framework fundamentals
    applyTo[5]: packages/octane/src/**,packages/app-core/src/**,packages/vite-plugin-octane/src/**,packages/rspack-plugin-octane/src/**,packages/rsbuild-plugin-octane/src/**
  - path: @.agents/memories/testing.md
    description: Octane test quality and observation-boundary rules
    applyTo[5]: **/*.test.*,**/*.spec.*,**/tests/**,**/_fixtures/**,benchmarks/**
  - path: @.agents/memories/tsrx-authoring.md
    description: "Full .tsrx authoring reference: components, text holes, events, control flow, refs"
    applyTo[1]: **/*.tsrx

# Additional Conventions Beyond the Built-in Functions

As this project's AI coding tool, you must follow the additional conventions below, in addition to the built-in functions.

# Octane

Octane is a UI framework by Dominic Gannaway, the successor to Inferno. It gives
you React's programming model (the same hooks, `memo`, context, portals,
Suspense, transitions), but it compiles components ahead of time. Components are
authored in `.tsrx`. It is alpha: the runtime, compiler, and SSR/hydration paths
all work and have a large test suite, but APIs still move.

Trust the source over any summary, this file included:

- `packages/octane/src/runtime.ts`: the client runtime. It is long and heavily
  commented, and those comments are the design spec.
- `packages/octane/src/runtime.server.ts` and `src/server/`: SSR. `docs/ssr.md`
  documents the public surface.
- `packages/octane/src/compiler/`: the `.tsrx` compiler.
- `packages/octane/src/index.ts` and `constants.ts`: the public client API.
- `docs/differences-from-react.md`: the divergence contract.
- `docs/packages.md`: the generated package inventory, checked by CI.

Route a change to the package that owns the behavior. When an application,
binding, integration, benchmark, or test exposes a defect in the Octane runtime,
compiler, scheduler, SSR, hydration, app-core, or build tooling, add a regression
at the owning package and repair the implementation there. Do not hide it behind
an application-specific workaround, a weakened test, generated output, or
test-only behavior, and keep the real integration scenario as end-to-end
evidence.

## The workflows live in skills, so load the skill first

This file does not carry the branch, PR, issue, bug, or audit procedure. Each of
those is a skill, and a skill only helps if it is loaded before the work starts
rather than after the work is already done a different way. Load one as soon as
the task reaches its trigger, including when the trigger is a step you arrived at
yourself rather than the thing you were asked for:

- `create-a-pr`: any branch, commit, changeset, or PR, including a PR you decided
  to open at the end of a task that was about something else.
- `handle-issue`: a GitHub issue number or link.
- `bug-hunter`: a failing test, a regression, or behavior that differs from
  expectation.
- `octane-core-extend`: before editing `packages/octane/src`.
- `performance-audit`: a change that can move render, SSR, hydration, compiler
  output, or bundle cost.
- `react-library-port`: a new or existing `@octanejs/*` binding.
- `authoring-tsrx`: writing a new `.tsrx` file.
- `triage`: the owning area is unclear.

## Your React instincts are the main failure mode here

Octane is React-shaped and deliberately different in specific places. Reading the
surrounding code will not warn you, because it looks like React, so a competent
React change lands as a plausible, confident regression. Check
`docs/differences-from-react.md` before "fixing" any of these:

- Hooks are keyed by compiler-assigned call-site slot, not call order, so a hook
  may sit behind a condition or after an early return. A slot-keyed hook in a
  plain JS loop is a compile error: use the keyed `@for` directive or a child
  component. `use()` and `useContext` are exempt.
- An omitted dependency array is inferred by the compiler, not a bug. An explicit
  array keeps React's exact behavior and is never rewritten; `null` means "run
  every render".
- `useState` and `useReducer` return three members: `[state, update, getState]`.
- Events are native and delegated. There is no synthetic `onChange`: `onInput`
  is the per-keystroke handler and native `change` fires on blur. Do not add a
  synthetic layer. `OCTANE_NATIVE_TEXT_ONCHANGE` is migration guidance, not an
  instruction to rename callbacks, selects, or checkbox/radio handlers.
- Controlled `value`/`checked` match React's semantics exactly, minus the
  synthetic layer. `defaultValue`/`defaultChecked` are the uncontrolled escape.
- The keyed reconciler is LIS-based, not `lastPlacedIndex`. Final DOM and
  survivor identity are guaranteed; the set of physically moved nodes is not.
- `use()` starts provably-independent fetches together and suspends once per
  stratum. React runs the same code as a waterfall. Do not "fix" fetch-start
  timing, batch replay counts, or prefetch behavior toward React.
- `class`/`className` compose clsx-style, so an array yields `"a b"`. React
  coerces it to `"a,b"`.
- Refs are plain props: `ref={cb}`, `ref={obj}`, or `ref={[a, b]}`. There is no
  `forwardRef`.
- `lazy()` also accepts a bare component, and Suspense/ViewTransition may be
  wrapped in it.
- The first `root.render()` mounts synchronously, and `root.render(App, props)`
  is supported alongside `root.render(<App />)`.
- No class components, Server Components, StrictMode double-invoke, or legacy
  `ReactDOM.render` roots.

## Authoring `.tsrx`

Read a nearby `.tsrx` file first. The parts with no JavaScript equivalent:

- `function f() @{ … }` is shorthand for returning JSX. The `@{ … }` scope ends
  with exactly one output node.
- Dynamic text needs a cast, `{expr as string}`, unless the expression is
  provably a string. A bare `{expr}` is a renderable hole, not text.
- Template control flow uses directive blocks: `@if`/`@else`,
  `@for (const x of xs; key x.id)`/`@empty`, `@switch`/`@case`/`@default`, and
  `@try`/`@pending`/`@catch`. Plain JS control flow stays in setup.

Full reference: `.rulesync/rules/tsrx-authoring.md`.

## Types

Never write `declare module '*.tsrx'` in a published package's `src/`. It
silences `.tsrx` resolution rather than fixing it, so every import it covers
becomes `any`, including the package's own exported components. It is ambient, so
it ships in the tarball and applies to any program that includes it.
`pnpm tsrx-decls:check` enforces this.

Typecheck any program containing `.tsrx` with `tsrx-tsc --noEmit`, never plain
`tsc`. Octane-owned `.tsx` files carry a leading `/** @jsxImportSource octane */`
pragma. Use `OctaneNode` for renderables, never `React.ReactNode`.

## Working here

```bash
pnpm test          # full Vitest run
pnpm typecheck
pnpm format:files [path...]        # defaults to staged and unstaged files
pnpm format:files:check [path...]  # defaults to staged and unstaged files
pnpm format:check                  # optional repo-wide gate
```

Use the scoped Prettier commands while iterating. With no paths, both use the
union of staged and unstaged Git diffs; explicit file or directory paths
override that default. `format:files` writes changes and `format:files:check` is
read-only. Run `pnpm format:check` as a final gate only when a repo-wide check is
needed; otherwise prefer `format:files:check` to avoid scanning unrelated files.

`pnpm test` performs its explicit package prechecks and then starts one root
Vitest invocation for all projects declared in `vitest.config.js`; it does not
fan out through the packages' own `test` scripts. The root config sets
`silent: true`, so console output from both passing and failing tests is hidden
by default across every project. While diagnosing a test, use
`pnpm test -- --silent=false` to show all test console output, or
`pnpm test -- --silent=passed-only` to show output only from failing tests.
Vitest CLI options override the config value; no conditional config logic is
needed.

Add a changeset for user-facing package changes; stay on the `patch` track while
Octane is 0.x. Runtime, compiler, scheduler, reconciler, SSR/hydration, and build
pipeline changes follow `.rulesync/rules/core-engineering.md`.

Never mutate a parsed AST during compilation: rewrites are copy-on-write. Tests
deep-freeze adopted parser ASTs, so an in-place write throws at the offending
line.

## RuleSync

Generated agent files come from `.rulesync/rules/`: edit those and run
`pnpm rules:generate`; never hand-edit a generated file. This root rule becomes
`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and
`.cursor/rules/project.mdc`. The other rules carry `globs`, so agents that
support path-scoped rules load them only when you open a matching file.
