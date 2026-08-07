# Contributing to Octane

Thanks for helping out. Octane is in alpha: the runtime, compiler, and
SSR/hydration paths all work and carry a large behavioral test suite, but APIs
still move. Bug reports, regression tests, docs, new `@octanejs/*` bindings, and
core fixes are all welcome.

## Before you start

Octane is React-shaped and deliberately different in specific places, so
behavior that looks like a bug is sometimes the contract. Read
[docs/differences-from-react.md](./docs/differences-from-react.md) before
"fixing" any of these:

- Hooks are keyed by a compiler-assigned call-site slot, not call order, so a
  hook may sit behind a condition or after an early return.
- An omitted dependency array is inferred by the compiler. An explicit array is
  never rewritten, and `null` means "run every render".
- `useState` and `useReducer` return three members: `[state, update, getState]`.
- Events are native and delegated. There is no synthetic `onChange`: `onInput`
  is the per-keystroke handler and native `change` fires on blur.
- `class`/`className` composes clsx-style, so an array yields `"a b"`.
- Refs are plain props (`ref={cb}`, `ref={obj}`, `ref={[a, b]}`). There is no
  `forwardRef`.

Search the open issues and pull requests before opening a new one. For anything
larger than a contained fix, open an issue and agree on the approach first.

## Setup

Node.js 22.22.2 or newer (CI runs the suite on 22.22.2 and 24) and pnpm 11. The repo pins
its pnpm version in `package.json`, so `corepack enable` is the easiest way to
get the right one.

```bash
git clone https://github.com/octanejs/octane.git
cd octane
pnpm install
pnpm test
```

## Repository layout

- [`packages/octane`](./packages/octane) is the runtime and the compiler
  together, including SSR and hydration. `src/runtime.ts` is long and heavily
  commented, and those comments are the design spec.
- [`packages/app-core`](./packages/app-core) plus the Vite, Rspack, Rsbuild, and
  deployment-adapter packages are the app and build layer.
- The `@octanejs/*` binding packages are ports of React ecosystem libraries, one
  package each. [`docs/bindings-status.md`](./docs/bindings-status.md) is the
  generated per-package status table.
- [`examples/`](./examples) are runnable apps and Playwright regression
  fixtures, [`playground/`](./playground) is the scratch app,
  [`benchmarks/`](./benchmarks) holds the deterministic benchmark suites, and
  [`website/`](./website) is octanejs.dev, built with Octane itself.
- [`docs/packages.md`](./docs/packages.md) is the full generated inventory.

The playground is the quickest way to poke at the runtime by hand, and the
example apps double as Playwright regression fixtures:

```bash
pnpm --filter octane-playground dev
pnpm examples:check   # manifests, tooling contracts, types, production builds
pnpm examples:e2e     # browser journeys
```

Route a change to the package that owns the behavior. When an application,
binding, example, or benchmark exposes a defect in the runtime, compiler,
scheduler, SSR, hydration, app-core, or build tooling, add the regression test at
the owning package and repair it there. Do not hide it behind an
application-level workaround or a weakened test, and keep the real scenario as
end-to-end evidence.

## Writing code

- Read a nearby `.tsrx` file before writing one. The dialect reference is
  [`.rulesync/rules/tsrx-authoring.md`](./.rulesync/rules/tsrx-authoring.md):
  `@{ … }` return shorthand, `{expr as string}` text holes, and the `@if`,
  `@for`, `@switch`, `@try` directive blocks.
- Type-check any program containing `.tsrx` with `tsrx-tsc --noEmit`, never
  plain `tsc`. Use `OctaneNode` for renderables, not `React.ReactNode`.
- Never write `declare module '*.tsrx'` in a published package's `src/`. It is
  ambient, ships in the tarball, and turns every import it covers into `any`.
  `pnpm tsrx-decls:check` enforces this.
- Changes to the runtime, compiler, scheduler, reconciler, SSR/hydration, or the
  build pipeline follow
  [`.rulesync/rules/core-engineering.md`](./.rulesync/rules/core-engineering.md):
  state the observable contract first, keep hot paths allocation-free, and never
  claim a performance win without a measurement.
- Compiler output is built as AST, copy-on-write. Never mutate a parsed AST and
  never assemble generated JavaScript as strings. Tests deep-freeze adopted
  parser ASTs, so an in-place write throws at the offending line.

## Porting a React library

An `@octanejs/*` binding is a port of one pinned upstream release, not a
lookalike written from the upstream README. Before adding or extending one, read
[`.rulesync/skills/react-library-port/SKILL.md`](./.rulesync/skills/react-library-port/SKILL.md).
The short version:

- Pin an immutable upstream release and record it in `packages/<name>/UPSTREAM.md`
  (package, version, tag commit, advertised range, oracle versions).
- Inspect both the published package and the canonical repository at that tag.
  Do not assume the registry tarball contains the release's source, tests,
  fixtures, snapshots, or runner configuration; fetch missing evidence from the
  tagged repository and record which artifact supplied it.
- Vendor that release's React-facing source under `packages/<name>/upstream/`,
  byte-exact and unpublished, and lay `src/` out to mirror it so each Octane
  module sits where the upstream module it replaces does.
- Account for every upstream export in the `UPSTREAM.md` crosswalk: ported,
  reused verbatim from a framework-neutral core, divergence, or not applicable,
  each with evidence. An unfinished export is an explicit gap row, not silence.
- Where parity is unreachable (React internals, the synthetic event layer, class
  components), record the divergence in `UPSTREAM.md` and `status.json` with the
  reason, the alternative, and a behavioral test pinning Octane's behavior.

### Run the upstream suite

If the upstream package ships tests, they are the parity evidence to reach for
first. They encode the behavior its maintainers care about, which is exactly what
a port has to reproduce, and they cover cases a fresh suite written against your
own implementation will not think to check.

- Run upstream's framework-neutral suites unmodified against the core the port
  reuses. A failure there is the port breaking the core's contract, not a test
  that needs adjusting.
- Port the React-binding suites case by case: re-author the fixtures in `.tsrx`,
  use [`@octanejs/testing-library`](./packages/testing-library) in place of
  `@testing-library/react`, keep the upstream case name, and cite the origin
  (`// Per <upstream path>:<line>`), the way the React conformance suite does.
  `node scripts/scaffold-react-port.mjs <react-test-file>` turns a React test
  file into a triage checklist to start from.
- Record the disposition of every upstream test file in `UPSTREAM.md`: run as-is,
  ported and where it now lives, or out of scope with the reason (React
  internals, `react-test-renderer`, StrictMode double-invoke, an API Octane does
  not expose).
- Never weaken an upstream assertion to make it pass. Triage the failure first;
  if it turns out to be a deliberate divergence, keep the case and assert
  Octane's behavior with an `// OCTANE DIVERGENCE:` rationale. Skipped and todo
  markers are not a tracking mechanism here: `pnpm test:markers:check` rejects
  them, so an unported case lives in the crosswalk instead.
- Add negative controls for the parity harness itself: removing, renaming,
  skipping, or failing to execute a recorded case, and changing pinned evidence,
  must make validation fail. The tests need tests too; otherwise a green harness
  can be a stale evidence collector.

### Configure parity execution

Follow [the React parity test-execution contract](./docs/react-parity-testing.md)
when a binding adds executable parity lanes. Keep the complete local project in
`vitest.config.js`, then declare which work belongs to the generic parity runner:

```js
testExecution: {
	group: 'react-parity',
	include: ['packages/example/tests/upstream/**/*.test.ts'],
}
```

Omit `testExecution.include` when the runner owns the complete project. When it
is present, it contains parity-owned patterns only;
`vitest.ci-sharded.config.js` derives the complement for ordinary shards. Do not
put package paths in `ci.yml`, create package-specific parity jobs, or encode
shard/Node/job details in the base project metadata. Package manifests under
`packages/*/audit/react-parity.json` are discovered automatically.

Fill the remaining gaps (DOM output over event sequences, render counts, effect
ordering, ref lifecycle, keyed reorder identity) with differential and
Octane-only tests as the skill describes.

Existing bindings predate this and are not all pinned and vendored yet. Bring one
up to it when you next touch it.

## Tests

Every bug fix needs a test that fails before the fix and passes after it.

Tests protect behavior a consumer can observe, not the route the implementation
takes to get there: assert rendered output, state, effects, refs, events, and
diagnostics rather than private helper names or exact internal call order. The
full policy is [`.rulesync/rules/testing.md`](./.rulesync/rules/testing.md).

Core tests live under `packages/octane/tests`: top-level files for runtime
behavior, `compiler/` for suites that only compile source, `conformance/` for
ports of `facebook/react` cases, `differential/` for the same fixture run
through both Octane and React, and `hydration/` for server-render-then-adopt
tests.

```bash
pnpm test                                    # full suite
pnpm test -- --silent=false                  # show test console output
./node_modules/.bin/vitest run packages/octane/tests/<file>.test.ts --reporter=verbose
```

A committed test must execute and pass. `pnpm test:markers:check` fails CI on
skipped or expected-failure markers, so an intentional divergence is an ordinary
passing assertion with an `// OCTANE DIVERGENCE:` comment.

## Generated files

Several checked-in files are generated and verified in CI. Edit the source and
run the generator instead of hand-editing the output:

| Output | Source | Command |
| --- | --- | --- |
| `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.claude/`, `.github/`, `.cursor/`, `.gemini/` | `.rulesync/rules/*` and `.rulesync/skills/*` | `pnpm rules:generate` |
| `docs/packages.md` | workspace manifests | `pnpm packages:inventory` |
| `docs/bindings-status.md` | each binding's `status.json` | `pnpm bindings:status` |
| `docs/parity-gaps.md` | test pins | `pnpm parity:gaps` |
| `docs/binding-parity-gaps.md` | binding parity data | `pnpm binding-parity:gaps` |
| `docs/react-parity-coverage.md` | the React parity ledger | `pnpm react-parity:generate` |
| Production error catalog and formatters | `octane` error-code sources | `pnpm error-codes:generate` |
| `@octanejs/cli` data snapshot | binding and error-code catalogs | `pnpm cli:data` |
| Lucide and Phosphor icon sources | upstream icon sets | `pnpm lucide:generate`, `pnpm phosphor-icons:generate` |
| shadcn registry | `packages/shadcn` sources | `pnpm shadcn:registry` |

Each has a `:check` counterpart that CI runs, so a stale output fails the lint
job.

## Before you push

```bash
pnpm format:files             # write, while iterating
pnpm format:check             # repo-wide gate, when you need one
pnpm typecheck
pnpm test
```

`format:files` and `format:files:check` default to the union of the staged and
unstaged Git diffs; pass files or directories to override that. Reach for the
repo-wide `format:check` only when a change can affect files outside your diff.

Markdown is hand-authored and excluded from Prettier, so a docs-only change has
no formatting to fix. A targeted test run is fine for a small change, as long as
the pull request says what you ran and what you did not.

## Changesets

Add a changeset for user-facing package changes and skip it for docs-only,
test-only, or internal tooling work:

```bash
pnpm changeset
```

Octane is 0.x, so every changeset stays on the `patch` track. `major` and
`minor` bumps fail CI.

## Commits and pull requests

- Branch names are `feat/…`, `fix/…`, `docs/…`, `test/…`, and so on for the
  other types.
- Commit subjects are conventional commits, scoped where it helps:
  `fix(compiler): render the non-JSX arm of ternary child holes`.
- The pull request body should say what changed, why, and what you ran to
  validate it. Call out anything you deliberately left unverified.
- Every pull request carries exactly one type label: `feat`, `fix`, `docs`,
  `test`, `perf`, `refactor`, `chore`, or `ci`. You do not apply it;
  `.github/workflows/label-pr.yml` reads it off a conventional-commit title and
  falls back to the `feat/…`, `fix/…`, or other type-prefixed head branch when
  the title does not declare one. `bug` and `enhancement` belong to issues.

CI intentionally runs nothing while a pull request is a draft and starts on the
`ready_for_review` event. From there it runs the sharded test suite on Node 22 and
24, `typecheck`, the lint job with all the generated-file checks, the heavy
integration lanes, the example browser journeys, and the website integration
suite. Documentation-only changes take a lighter path.

Green checks are necessary but not sufficient readiness evidence. Before a PR
leaves draft, separately confirm that all actionable review threads are
resolved on the current head, the head contains the live base branch, and GitHub
reports the PR mergeable without conflicts or a branch-currency blocker. Repeat
those checks after the final push; a review fix or a moving base can invalidate
an earlier clean result. Agents leave drafts alone unless explicitly authorized
to mark one ready, and that authorization never authorizes merging.

Because Actions starts on `ready_for_review`, the initial authorized transition
is the bootstrap that creates the required checks. It may happen only after the
non-CI gates above and relevant local validation pass. Keep the PR ready while
CI runs, but do not call it fully ready or merge-ready until every required
check is terminal and successful.

## AI-assisted contributions

Agent-written changes are welcome, with one rule: tick the provenance box in the
pull request template whenever an agent produced the diff, no matter which
account pushes it.

```md
- [x] An agent produced this diff (`agent-authored`)
```

An agent commits under a human's credentials, so the author field cannot show
this and the box is the only signal that separates the two. Leaving it clear or
omitting the section is a positive claim that a human wrote the diff.

`.github/workflows/label-pr.yml` reads the box and applies the `agent-authored`
label for you. It runs with the repository's own token rather than yours, so this
works identically from a fork and needs nothing from a maintainer. The same
workflow converts the pull request back to draft if it was opened ready, because
a label added by the repository token cannot trigger another workflow. The
separate `draft-agent-prs.yml` workflow remains a fallback for labels applied by
a maintainer or GitHub App. A maintainer marks the pull request ready for review
once it has been looked at.

Only a checked box means agent-authored. An empty box or missing section is
treated as human-authored, removes a stale `agent-authored` label, and leaves the
label check successful. Agents must therefore keep and tick the section;
`gh pr create --fill` drops the template and would make an agent-produced diff
look human-authored, so use `--body-file` instead.

When an agent updates an existing pull request body, it must merge its changes
into the current body rather than replace it from a template. Bot-managed
regions are opaque and must be preserved byte-for-byte, including Cursor
Bugbot's `<!-- CURSOR_SUMMARY -->` through `<!-- /CURSOR_SUMMARY -->` block.
The agent refetches immediately before the edit and verifies the body afterward
so a concurrent bot update is not silently lost.

The repository ships its own agent context: `AGENTS.md` (and its per-tool
siblings) plus task skills for branching, issues, bug hunting, core changes,
performance audits, and binding ports. Point your agent at those rather than
re-deriving the conventions, and remember they are generated: edit
`.rulesync/skills/*` and rerun `pnpm rules:generate`.

## Reporting bugs

A good report includes the Octane version, the build integration in use (Vite,
Rspack, or Rsbuild), the smallest `.tsrx` or `.tsx` reproduction you can manage,
and the expected versus actual behavior. If the surprise is a difference from
React, check the differences doc first so the report can say whether the
divergence is the documented one. For a minified production error, decode it
with `pnpm dlx @octanejs/cli explain <error>`.

## License

Octane is MIT licensed. By contributing, you agree that your contributions are
licensed under the same terms.
