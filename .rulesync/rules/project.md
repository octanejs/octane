---
root: true
targets: ['*']
description: 'Octane project overview and development guidelines'
globs: ['**/*']
---

# Octane

Octane is Dominic Gannaway's successor to Inferno: a React-shaped UI framework
with hooks, `memo`, context, portals, Suspense, and transitions, compiled ahead
of time from `.tsrx`. The runtime, compiler, SSR, hydration, and large test suite
work, but this is alpha and APIs still move.

Trust the source over any summary, this file included:

- `packages/octane/src/runtime.ts`: the client runtime. It is long and heavily
  commented, and those comments are the design spec.
- `packages/octane/src/runtime.server.ts` and `src/server/`: SSR. `docs/ssr.md`
  documents the public surface.
- `packages/octane/src/compiler/`: the `.tsrx` compiler.
- `packages/octane/src/index.ts` and `constants.ts`: the public client API.
- `docs/differences-from-react.md`: the divergence contract.
- `docs/packages.md`: the generated package inventory, checked by CI.

Fix defects in the package that owns the behavior and add the regression there.
Do not hide framework defects behind app workarounds, weak tests, generated
output, or test-only behavior; retain the integration scenario as end-to-end
evidence.

## The workflows live in skills, so load the skill first

Branch, PR, issue, bug, and audit procedures live in skills. Load one when its
trigger first arises, even if it is a later step you chose:

- `create-a-pr`: before any branch, commit, changeset, or PR.
- `handle-issue`: a GitHub issue number or link.
- `bug-hunter`: a failing test, a regression, or behavior that differs from
  expectation.
- `octane-core-extend`: before editing `packages/octane/src`.
- `performance-audit`: a change that can move render, SSR, hydration, compiler
  output, or bundle cost.
- `react-library-port`: a new or existing `@octanejs/*` binding.
- `authoring-tsrx`: writing a new `.tsrx` file.
- `triage`: the owning area is unclear.

Each skill is `.rulesync/skills/<name>/SKILL.md`, with a generated per-tool copy;
read that path directly if your tool cannot load a skill by name.

One `create-a-pr` rule must survive not loading it: keep the PR template's
provenance section and tick its box when an agent produced the diff. An agent
commits under a human's credentials, so nothing else tells the two apart and a
clear or missing box asserts a human wrote it. A bot turns a checked box into
`agent-authored` and derives the type label from the title, so never apply labels
yourself.

## Your React instincts are the main failure mode here

Octane looks like React but differs deliberately. Check
`docs/differences-from-react.md` before changing any of these:

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
pnpm typecheck:files [path...]     # defaults to staged and unstaged files
pnpm sync
pnpm format:files [path...]        # defaults to staged and unstaged files
pnpm format:files:check [path...]  # defaults to staged and unstaged files
pnpm format:check                  # optional repo-wide gate
```

Before any push, run `pnpm sync` and commit its generated changes.

Scoped typecheck and Prettier commands default to staged and unstaged Git diffs;
explicit files or directories override that default. `format:files` writes and
`format:files:check` is read-only. Use repo-wide checks only when needed.

`pnpm test` runs package prechecks, then one root Vitest invocation for every
project in `vitest.config.js`; it does not fan out through package `test`
scripts. Root config uses `silent: true`. While diagnosing, pass
`--silent=false` for all console output or `--silent=passed-only` for failing
tests. CLI options override the config.

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
