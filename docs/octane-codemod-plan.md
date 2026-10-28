# `@octanejs/codemod` implementation plan

Status: prototype landed in `packages/codemod` (2026-10-28); M1's workstream 1
and Hacker News lane are done, and the lane passes all 10 Playwright journeys
(2026-10-28, local run). The TS2300 fix landed in #2265, so the corpus now
compiles with no errors; the first publish is outstanding. The js-framework
benchmark run (2026-10-28) measures the output's speed. This plan takes it
from a working prototype to a migration tool we can point at any React app.

## Goal

`octane-codemod <dir>` turns a React + TSX/JSX codebase into an Octane + TSRX
codebase that builds, typechecks, and behaves the same, and with `--strong`
takes every module it can into Strong mode. Whatever it cannot migrate, it
reports with a file, a line, and the replacement.

Three properties hold for every rule, now and later:

1. **Behavior-preserving by default.** A rewrite is applied only when it keeps
   React's observable behavior. `{n && <X />}` stays a hole because React
   renders `0` there; `useEffect(fn)` gains `null` because Octane infers an
   omitted list. Idiomatic-but-different rewrites need an explicit flag.
2. **The compiler is the oracle.** Every migrated module is compiled by the
   project's own `octane/compiler` (or the bundled one) before it is written.
   Strong decisions come from compiler diagnostics, not from a second analysis
   in the codemod.
3. **Source-preserving.** Untouched code is copied byte for byte, comments and
   formatting included. Only the spans a rule rewrites change.

Non-goals: Server Components, React Native, and porting third-party React
libraries (that is `octane-react-library-port`; the codemod maps to existing
bindings and reports the rest).

## What the prototype does

Architecture, in `packages/codemod/src`:

| Module | Role |
| --- | --- |
| `transform.js` | One module: parse with the TypeScript parser, then a recursive emitter copies source and lets per-node rules replace spans. Imports are placeholders filled at the end, so rules can request imports as they go. |
| `mappings.js` | React → Octane names: values, type aliases, unsupported APIs, dependency hooks. |
| `project.js` | Discovery, a first pass that decides which modules become `.tsrx`, a second that rewrites every module with that rename map (specifiers, dynamic imports, `index.html`), binding substitution from the CLI catalog, verification. |
| `strong.js` | Compile in Strong mode, apply compiler-suggested edits plus codemod fixers, repeat to a fixpoint, fall back to compatibility when errors remain. Reuses `applyFixes`/`pruneImports` from `@octanejs/cli/fix`. |
| `compiler.js` | Resolve `octane/compiler` from the project first, then the bundled copy. |
| `bin.js` | CLI. |

Rules are listed in the package README. Tests: per-rule golden fixtures, each
also compiled by the real compiler; a multi-module project test; and the Hacker
News reader, whose `jsx/` twin must migrate to exactly the module set of its
hand-written `tsrx/` twin.

### Validation so far

In-repo: `examples/hacker-news/jsx` migrates to 9 `.tsrx` modules (the same set
as the hand-written twin), compiles clean, and **typechecks clean under
`octane-tsc`**. With `--strong`, 6 of 9 become Strong; the other 3 are blocked
only by `OCTANE_STRONG_UNTRUSTED_HTML`, a `trustHTML()` decision that belongs
to a person.

Third-party corpus, shallow clones at pinned commits, dry run, every output
compiled:

| App | Commit | Modules | Migrated | `.tsrx` | Compile errors | Strong |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| TodoMVC React (`tastejs/todomvc`) | `ff43b02e59df` | 12 | 7 | 6 | 0 | 6/6 |
| bulletproof-react (`apps/react-vite`) | `9506629ed003` | 133 | 109 | 60 | 0 | 56/60 |
| react.dev `src/` | `0821e7d9428a` | 123 | 107 | 91 | 0 | 66/91 |
| TanStack Query React examples | `e423d30ae010` | 186 | 126 | 81 | 0 | 70/81 |
| Excalidraw components | `e7b534668a60` | 236 | 200 | 160 | 0 | 108/160 |
| Excalidraw app | `e7b534668a60` | 43 | 25 | 16 | 0 | 10/16 |
| **Total** | | **733** | **574** | **414** | **0** | **316/414 (76%)** |

The first corpus run had 2 compile errors, both one Octane defect rather than a
codemod one: a `.tsrx` module rejected `import type { Toc }` beside
`function Toc` with TS2300, which `.tsx` accepts, because the acorn-based scope
check treated a type-only import as a value binding. #2265 fixed it in the
parser patches with a regression test; the codemod never renamed around it.

"Compiles" is not "behaves the same". Behavioral evidence is the first thing
the validation workstream adds (below).

Strong blockers left across the corpus, by frequency, which orders workstream 5:

| Diagnostic | Count | Planned response |
| --- | ---: | --- |
| `OCTANE_STRONG_EXPLICIT_DEPENDENCIES` (non-equivalent list) | 66 | `[]` mount effects that read props → `useEffectEvent`; otherwise report |
| `OCTANE_STRONG_EFFECT_STATE_UPDATE` | 38 | layout measurement → `useLayoutSnapshot`; derived state → render calculation |
| `OCTANE_STRONG_MAP_JSX` | 30 | widen `@for` lowering (helpers, attribute positions, row-local keys) |
| `OCTANE_STRONG_RENDER_REF_READ` / `_WRITE` | 20 | compiler `useLazyRef` edit where it applies; move reads to effects/handlers |
| `OCTANE_STRONG_RENDER_AMBIENT_READ` | 14 | `useSyncExternalStore` with a server snapshot |
| `OCTANE_STRONG_ELEMENT_API` | 15 | stays compatibility (Children/cloneElement); report the render-prop recipe |
| `OCTANE_STRONG_INDEX_KEY` | 10 | type-aware: suggest an item id field |
| `OCTANE_STRONG_RENDER_MODULE_STATE_READ` | 9 | report |
| others (data fetch, chains, locale, impure calls) | <8 each | report with the documented replacement |

### Performance: js-framework-benchmark

The React variants of js-framework-benchmark, migrated and run against the
hand-written `octane-tsrx` target and React (2026-10-28: local Chromium,
production builds, `benchmarks/js-framework/run.mjs`, 8 iterations, medians).
`react-hooks` is the repo's `benchmarks/js-framework/react` fixture, which is
upstream's plus the harness's `flushSync` wrapper; `react-classes` is upstream
`frameworks/keyed/react-classes` at `247fafa2`. Every target passed the
harness's DOM check after every timed op. The migrated apps were scratch Vite
projects; nothing in the repo runs this yet.

| Op | `octane-tsrx` (ms) | Codemod | Codemod, Strong | React |
| --- | ---: | ---: | ---: | ---: |
| run | 2.3 | 2.2× | 2.3× | 2.4× |
| replace | 5.0 | 1.5× | 1.5× | 2.1× |
| add | 1.8 | 1.8× | 1.8× | 2.5× |
| update | 0.4 | 1.0× | 1.3× | 2.3× |
| select | 0.005 | 14× | 16× | 19× |
| swap | 0.018 | 4.5× | 4.9× | 100× |
| remove | 0.3 | 1.3× | 1.3× | 2.3× |
| runlots | 13.1 | 2.3× | 2.3× | 9.1× |
| select_lots | 0.003 | 169× | 166× | 271× |
| clear | 22.0 | 1.2× | 1.2× | 2.1× |
| JS, gzip -9 | 36.8 kB | 65.0 kB | 71.8 kB | 63.1 kB |

Ratios are to `octane-tsrx`. `update` and `remove` sit near the timer's 0.1 ms
resolution.

- The migrated `react-hooks` is correct and faster than React on every op
  (1.1× on run to 22× on swap), but slower than the hand-written twin on every
  op except update (1.2× on clear to 169× on select_lots), and it ships about
  as many bytes as React.
- `--strong` fell back to compatibility on three real blockers: the reducer
  increments a module-level `nextId` and calls `Math.random`
  (`OCTANE_STRONG_IMPURE_UPDATER`, a bug under React's own purity rule too), and
  the module imports `flushSync` (`OCTANE_STRONG_COMPAT_IMPORT`). With those
  fixed by hand the module became Strong with nothing else to fix, ran no
  faster, and grew 6.8 kB (not yet attributed). The "Codemod, Strong" column is
  that hand-fixed copy.
- `react-classes` reports its four class components and stays unrunnable until
  workstream 3 converts classes.

Where the gap comes from, measured on hand-edited copies of the migrated output
in a second run (ratios to that run's `octane-tsrx`):

| Variant | run | replace | runlots | clear | select | swap | select_lots |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Codemod output | 2.3× | 1.5× | 2.3× | 1.2× | 18× | 4.3× | 158× |
| A: text holes cast | 1.8× | 1.4× | 1.9× | 1.2× | 16× | 4.2× | 156× |
| B: A, plus `memo(Row)` inlined into the `@for` | 1.04× | 1.00× | 1.02× | 0.95× | 28× | 6.8× | 297× |

That gives three rule candidates:

1. **Text holes** (workstream 2): `{item.label as string}` and
   `{String(item.id)}` in place of bare holes take about 20% off run and
   runlots. It needs the item types, so it waits for the type-aware program.
2. **`render(<App />)` → `render(App)`** (workstream 3): 3.0 kB gzip off the
   bundle (65.0 → 62.0 kB). Timing was not measured separately.
3. **Row inlining, on hold.** Inlining the `memo` row component into the `@for`
   reaches parity on run, replace, runlots, and clear, but almost doubles
   selection cost: without `memo` every row re-renders on select, and the
   inlined loop still misses the twin's keyed-selection path. The likely cause,
   unconfirmed, is that the migrated app keeps React's single `useReducer`
   state `{ data, selected }` behind a wrapped `dispatch`, where the twin uses
   separate `useState`s. That is a compiler question; the rule waits for its
   answer.

The rest of the byte gap is React habit (`memo`, `useReducer`, `flushSync`,
separate `Button` and `Jumbotron` components), which a behavior-preserving
codemod keeps.

## Workstreams

Each workstream ships as its own PR with golden fixtures and corpus numbers in
the description. Ordered by what unblocks the most real code.

### 1. Correctness hardening (done)

Every name is resolved through its declaration, not its spelling, so a shadowed
`React`, `useState`, or event parameter is never rewritten.

- Each module is bound by a single-file TypeScript program (no libs, no module
  resolution); React imports, namespaces, event parameters, contexts, and the
  global `JSX` resolve through the checker. Added imports are aliased when they
  would shadow a module declaration or a global the module reads (the DOM's
  `MouseEvent` beside an Octane `MouseEvent` type).
- Contexts by provenance: a `createContext` result here, or an export the
  project index proves is one, re-exports followed. Only a package's export is
  judged by its `*Context` name; a namespace member such as radix's
  `Tooltip.Provider` is never rewritten.
- Newlines inside string and template literals are held aside while arms are
  re-indented, so a moved literal keeps its value.
- Comments in rewritten spans survive: inside `return ( … )` as setup comments,
  in a converted hole as `{/* … */}` before the directive.
- Idempotent: a test over the fixtures and a two-run project test; the whole
  corpus changes nothing on a second run.
- `<Fragment key>` rows become `<>`; `className` stays when a spread could set
  the class; a list stays `.map()` when `@for` would read its item binding in the
  source expression (TDZ) or a `function` row reads its own `this`/`arguments`.
- `isBoolean` admits only proofs (comparisons, `!`, `Boolean()`), no name
  heuristics.
- Octane `.tsx` → `.tsrx` upgrade path: `octane` imports are API sources, and
  React-only rewrites never apply to them.

### 2. Type-aware mode

Default on when a `tsconfig.json` is found; `--no-types` for speed. Build one
`ts.Program` and hand each module its `SourceFile` and checker.

- Lower `a && <X />` to `@if` when `a`'s type excludes `number`, `bigint`, and
  `NaN`-producing types. This is the largest remaining gap against the
  hand-written HN output.
- Text holes: `{x}` where `x: string` → `{x as string}`; `number` → `{String(x)}`.
  Merge adjacent static text and proven-string holes into one text binding,
  as the hand-written HN twin does (`{'(' + host + ')' as string}`). On
  js-framework-benchmark the casts take about 20% off run and runlots; measure
  the corpus apps too before making it the default.
- Prove `.map` receivers are arrays (vs. Immutable, Observables) and that a key
  is an item identity.
- Resolve `onChange` on inputs with a dynamic `type` from the union of literal
  types.

### 3. React API coverage

- Class components → function components for the common subset: `state` +
  `setState` → `useState` per field, `componentDidMount`/`Update`/`WillUnmount`
  → effects, instance fields → refs. Anything else (`getSnapshotBeforeUpdate`,
  `forceUpdate`, legacy context) stays reported. js-framework-benchmark's
  `react-classes` is the acceptance case.
- `root.render(<App />)` with no key, ref, or children → `root.render(App)`,
  or `root.render(App, { … })` for plain attributes: 3 kB gzip off the
  js-framework entry.
- Error boundaries → `@try { … } @catch (error) { … }` when the boundary is used
  in one place, else Octane's `ErrorBoundary`; `react-error-boundary` usage maps
  to `@try` directly.
- `createRef` in function components → `useRef`; `defaultProps` → destructuring
  defaults; `propTypes` dropped behind `--drop-prop-types`.
- `Context.Consumer` outside a template (a `.tsx` target) → extract a small
  component that calls `use(Context)`.
- Render-time setter syncing a prop (`if (prev !== id) { setPrev(id); … }`) →
  `useLinkedState`.

### 4. Ecosystem and project wiring

- **Binding import adapters**, generated from each binding's `status.json`
  rather than hand-written: `@radix-ui/react-<x>` → the `@octanejs/radix`
  namespace (`import * as Dialog from '@radix-ui/react-dialog'` →
  `import { Dialog } from '@octanejs/radix'`), router subpaths, icon packages.
  Radix alone accounts for 6 of bulletproof-react's 9 unmapped packages.
- **Unmapped React packages**: today they are reported as errors. Offer the
  `octane/react` ReactCompat boundary as an opt-in escape hatch so an app can
  migrate before every dependency has a binding.
- **Project wiring through `octane init`**, not reimplemented: after the source
  pass, run init's bundler/tsconfig/script edits, swap `react`/`react-dom` and
  mapped packages for `octane` and the bindings in `package.json`, and add an
  `octane migrate` command to `@octanejs/cli` that runs this package.
- Refuse clearly on Server Components (`'use server'` modules, `next/*` app
  router) and React Native.
- Tests: `@testing-library/react` → `@octanejs/testing-library` (mapped today),
  Jest → Vitest guidance.

### 5. Strong-mode depth

Ordered by the blocker table above. The rule for every new fixer: **the compiler
owns the fix**. A rewrite that keeps meaning exactly is added to the compiler's
`suggestions[].edits` for its diagnostic, so `octane analyze --fix` and the
codemod apply the same edit. The codemod-side fixers in `strong.js` (explicit
equivalent dependencies, prop-initialized state) move into the compiler too.

- Write `octane-strong-baseline.json` for modules left in compatibility mode,
  so the migrated app's coverage is visible to `octane analyze` from day one.
- `--strong` reports per-module "N blockers to Strong" with the documented
  replacement, ranked by how many modules each blocker would unlock.

### 6. Output quality and CLI

- `--diff` (unified diff), `--only <rules>` / `--skip <rules>`, `--report md`.
- Refuse to write into a dirty git tree unless `--allow-dirty`.
- Optional Prettier with `@tsrx/prettier-plugin`, off by default until its
  known paren-drop semantics bug is fixed; then compile-check the formatted
  output, not just the raw one.
- Worker threads for large repos (Excalidraw's 236 modules take 3 s single
  threaded with Strong; fine today, but the type-aware program will cost more).

## Validation

| Layer | Evidence | Where |
| --- | --- | --- |
| Rule | Golden input/output pair per rule, output compiled in compatibility and Strong mode | `packages/codemod/tests/fixtures` |
| Types | Migrated fixtures and HN typechecked with `octane-tsc` | add to the codemod test project |
| Behavior, in repo | `examples/hacker-news/codemod.mjs` respells `jsx/` with React imports, migrates it, and fails on any codemod error or leftover React import; `build:codemod` typechecks and builds it; the shared Playwright spec runs it as the `codemod` project (`:5195`, SSR `:5197`) | `pnpm --dir examples/hacker-news test:e2e`, part of the examples e2e job |
| Behavior, third party | For corpus apps with their own tests (bulletproof-react's Vitest + Testing Library suite), migrate and run their tests on `@octanejs/testing-library` | corpus job |
| Performance | A `codemod` target in `benchmarks/js-framework` that migrates the `react` fixture at build time, run against `octane-tsrx` and `react`; manual today (above) | `benchmarks/js-framework`, report only |
| Parity | Feed migrated components through the React-vs-Octane parity probe harness: same fixture, both renderers, compare DOM and event logs | reuse the parity harness |
| Corpus | Pinned commits above, report modules migrated / compile errors / `octane-tsc` errors / Strong share per app on each run | scheduled job, report only |

The corpus job reports; it does not gate on counts. The gates are the per-rule
fixtures, the HN behavior lane, and zero compile errors on supported patterns.

## Milestones

| Milestone | Contents | Exit criteria |
| --- | --- | --- |
| M0 (done) | Prototype, rules above, Strong fixpoint, corpus run | 574 modules, 2 compile errors (an Octane defect, since fixed), 76% Strong |
| M1 (in progress) | Workstream 1 (done), HN lane (done), TS2300 fix (done, #2265), first publish as `0.1.0` | 0 compile errors on corpus (done); HN spec green on migrated output (done: 10/10 journeys); idempotent (done) |
| M2 | Workstream 2 (types) | HN output matches the hand-written twin's holes and `@if`s; measured text-binding gain (js-framework: about 20% on run and runlots) |
| M3 | Workstreams 3 + 4 | Error boundaries and simple classes convert; `react-classes` passes the js-framework harness; radix adapter; `octane migrate`; bulletproof-react tests pass after migration |
| M4 | Workstream 5 | Strong share on the corpus up from 76%, each fixer owned by the compiler |
| M5 | Workstream 6, docs page on octanejs.dev | Migration guide built from real corpus before/after |

## Open questions

- **Name.** The prototype is `@octanejs/codemod` with an `octane-codemod` bin,
  matching `@octanejs/cli`. Publish an unscoped `octane-codemod` alias too?
- **JavaScript projects.** A `.jsx` module becomes `.tsrx` today, which is
  TypeScript syntax. Fine for the compiler, but a JS-only project gains files
  its tooling treats as TS. Is there appetite for a JS flavor of TSRX, or do we
  keep JS projects on `--target tsx`?
- **Default aggressiveness.** Ship behavior-preserving by default with a
  `--idiomatic` flag for rewrites like `{n && <X />}` → `@if (n)`, or make
  type-aware proofs good enough that the flag is rarely needed?
- **Render props.** Functions passed as props that return JSX stay plain today.
  Converting them to `() => @{ … }` would put their output on the template
  path; worth it only with a measured gain.
