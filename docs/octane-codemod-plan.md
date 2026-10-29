# `@octanejs/codemod` implementation plan

Status: prototype landed in `packages/codemod` (2026-10-28); M1's workstream 1
and Hacker News lane are done, and the lane passes all 10 Playwright journeys
(2026-10-28, local run). The TS2300 fix landed in #2265, so the corpus now
compiles with no errors; the first publish is outstanding. The js-framework
benchmark run (2026-10-28) measures the output's speed, and the text-hole rule
it called for has landed. The weather and chat benchmark apps migrate and pass
their harnesses, and the three codemod defects they found are fixed. Every
module that had JSX now becomes TSRX, so none is left as `.tsx` outside Strong
mode. Every other React app in the repo has been migrated and checked against
its own harness (2026-10-29, below). This plan takes it
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

In-repo: `examples/hacker-news/jsx` migrates to 11 `.tsrx` modules: the
hand-written twin's 9, plus the two entries, which the twin keeps as `.tsx`. It
compiles clean and **typechecks clean under `octane-tsc`**. With `--strong`, 8
of 11 become Strong; the other 3 are blocked only by
`OCTANE_STRONG_UNTRUSTED_HTML`, a `trustHTML()` decision that belongs to a
person. The text-hole rule casts the holes whose types prove them text
(`{String(rank)}`, `{relativeTime(created) as string}`). It leaves optional
fields such as `story.title?: string` as holes, where the hand-written twin
casts them: React renders a missing title as nothing.

Third-party corpus, shallow clones at pinned commits, dry run, every output
compiled:

| App | Commit | Modules | Migrated | `.tsrx` | Compile errors | Strong |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| TodoMVC React (`tastejs/todomvc`) | `ff43b02e59df` | 12 | 7 | 7 | 0 | 7/7 |
| bulletproof-react (`apps/react-vite`) | `9506629ed003` | 133 | 109 | 78 | 0 | 74/78 |
| react.dev `src/` | `0821e7d9428a` | 123 | 110 | 107 | 0 | 77/107 |
| TanStack Query React examples | `e423d30ae010` | 186 | 127 | 92 | 0 | 81/92 |
| Excalidraw components | `e7b534668a60` | 236 | 212 | 181 | 0 | 122/181 |
| Excalidraw app | `e7b534668a60` | 43 | 28 | 23 | 0 | 17/23 |
| **Total** | | **733** | **593** | **488** | **0** | **378/488 (77%)** |

Every module that had JSX (`.jsx`, `.tsx`, or a `.js` file with JSX) becomes
`.tsrx`, including entries and helpers with no component template, so Strong
mode reaches all of them. That took the corpus from 414 `.tsrx` modules and
316 Strong to 488 and 378. A module that was JavaScript gains
`// @ts-nocheck`, so it stays as unchecked as it was.

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
| `OCTANE_STRONG_EXPLICIT_DEPENDENCIES` (non-equivalent list) | 69 | `[]` mount effects that read props → `useEffectEvent`; otherwise report |
| `OCTANE_STRONG_EFFECT_STATE_UPDATE` | 40 | layout measurement → `useLayoutSnapshot`; derived state → render calculation |
| `OCTANE_STRONG_MAP_JSX` | 36 | widen `@for` lowering (helpers, attribute positions, row-local keys) |
| `OCTANE_STRONG_RENDER_REF_READ` / `_WRITE` | 22 | compiler `useLazyRef` edit where it applies; move reads to effects/handlers |
| `OCTANE_STRONG_RENDER_AMBIENT_READ` | 14 | `useSyncExternalStore` with a server snapshot |
| `OCTANE_STRONG_ELEMENT_API` | 17 | stays compatibility (Children/cloneElement); report the render-prop recipe |
| `OCTANE_STRONG_INDEX_KEY` | 11 | type-aware: suggest an item id field |
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

Two causes, both since confirmed:

- **`String()` in a row was a compiler gap, not React state.** B's slower
  selection came from the `{String(item.id)}` cast inside the inlined row. In
  compatibility mode the compiler treated a call to a global as possibly
  reading live state, so that one call switched off every keyed-list fast path:
  the row skip on a parent render, the whole-list cache that keyed selection
  depends on, and the fast mount. The `useReducer` state and wrapped `dispatch`
  were not involved: the same reducer app with a bare `{item.id}` selected at
  0.79×. #2268 fixes the compiler (built-in conversions like `String` and
  `Number` no longer count as render calls unless shadowed); with it, B's
  source selects at 0.83×, select_lots 0.87×, swap 1.00×. #2268 is being
  extended to component bodies, where `String()` still has the same cost.
- **The un-inlined row's 18× select is `memo`'s comparator.**
  `memo(Row, (a, b) => …)` hides the row from every fast path, so all 1,000
  rows re-enter and run the comparator. `memo(Row)` without a comparator gets
  the row skip and the list cache back; a plain `function Row` also gets the
  fast mount. Inlining the row is unnecessary.

The rule candidates, as they now stand:

1. **Text holes: landed** (`template-text`). A child hole whose type is a
   string becomes `{x as string}`; a number or bigint (or a mix with strings)
   becomes `{String(x)}`, or `` {`${x}`} `` where a local shadows `String`. It
   takes about 20% off run and runlots here. Types come from one program over
   the project under its tsconfig, falling back to the module's own program.
   It runs only on `.ts`/`.tsx` modules in a project with `strictNullChecks`,
   the same boundary as the compiler's typed-text proof: otherwise a `string`
   may hold null, which React renders as nothing. This fixture is `.jsx`, so it
   stays bare. Across the corpus the rule casts 219 holes with no new compile
   errors. `String()` stays fast in component bodies only once #2268's
   extension lands.
2. **`render(<App />)` → `render(App)`** (workstream 3): 3.0 kB gzip off the
   bundle (65.0 → 62.0 kB). Timing was not measured separately.
3. **`memo` comparators**, in place of row inlining (workstream 3). Dropping a
   comparator changes when the component renders, so it is not
   behavior-preserving in general. Drop it when it compares a subset of props
   by identity and every prop it omits is provably stable (a `useReducer`
   `dispatch`, a `useCallback` with fixed dependencies), which is this
   fixture's case. Otherwise report it with the measured cost.

The rest of the byte gap is React habit (`memo`, `useReducer`, `flushSync`,
separate `Button` and `Jumbotron` components), which a behavior-preserving
codemod keeps.

### Weather and chat benchmark apps

The React ports in `benchmarks/weather-app` and `benchmarks/chat-stream`,
migrated from `de97a8ad54` (before the text-hole rule) and run through each
harness against `octane-tsrx` and React (2026-10-28, two runs at once, so the
timings are noisy; mins agreed). Both passed every harness check. Ratios are to
`octane-tsrx`:

| App, op | Codemod | Codemod with fixes | React |
| --- | ---: | ---: | ---: |
| weather, `forecast_cycle` | 1.53× | 1.03× | 1.34× |
| weather, `initial_ready` | 1.08× | 1.00× | 1.18× |
| weather, JS gzip (`octane-tsrx` 54.0 kB) | 88.5 kB | 53.7 kB | 67.7 kB |
| chat, `streamFine` | 2.6× | 1.0× | 3.8× |
| chat, `appendHistory` | 2.7× | 1.1× | 8.2× |
| chat, `switchConv` | 2.2× | 1.0× | 1.4× |
| chat, JS gzip (`octane-tsrx` 41.2 kB) | 66.2 kB | 41.0 kB | 62.3 kB |

The fixes column is a hand-edited copy; the ones now in the codemod are marked
fixed below.

Codemod defects, all fixed:

- **JSX left in a `.jsx` module** (weather). The entry kept `render(<App />)` as
  `main.jsx`, which Octane's Vite plugin does not compile, so the build failed;
  the codemod's own compile check calls the compiler directly and passed. Every
  module that keeps JSX now becomes `.tsrx` (above). Root-absolute `index.html`
  script paths now resolve from the page's directory, as Vite serves them.
- **A key on each arm of a conditional row stayed on the arms** (chat).
  `xs.map((x) => (x.a ? <li key={x.id} /> : <b key={x.id} />))` became an
  unkeyed `@for` whose arms compiled to runtime element descriptors: +12.8 kB
  gzip, 150 comment nodes instead of 24, and about 2× on streaming. A key every
  arm shares now moves to the header; arms keyed differently stay a `.map()`.
- **Finding lines** (chat) pointed at neither file: the codemod's notes carried
  the original file's lines under the new name, and Strong blockers carried the
  Strong candidate's lines, with its directive. Notes now name the original
  file, and blockers are shifted to the written one.

What the hand-edited copies needed beyond those:

- **Text-hole casts** (both), now the `template-text` rule. These apps are
  `.jsx`, so it does not reach them: they have no types to prove a hole text.
  In chat, the bare holes cost 12.4 kB gzip.
- **`{isActive && <div />}` as `@if`** (weather): `forecast_cycle` 1.53× → 1.08×.
  Correct only when `isActive` cannot be a number; untyped here, so it stays a
  hole (workstream 2).
- **Class error boundary** (weather), workstream 3. Two traps for that rule: a
  bare `{children}` inside a `@try` arm compiles to a dead statement with no
  diagnostic, so it must be `<>{children}</>`; and a catch-only `@try` keeps the
  Suspense runtime, 10.1 kB gzip more than `<ErrorBoundary fallback>`.
- **`export default memo(X)` / `export default X`** (weather) is an Octane
  compiler gap, not a codemod one: `findVoidComponentExports` in
  `packages/octane/src/compiler/bundler.js` accepts neither, so every call site
  takes the generic component slot, about 20 kB gzip here. Its compiled-code
  check already accepts both shapes.
- **Strong** (chat) fell back on `flushSync` and `window[name] =` writes during
  render; fixed by hand, it compiled Strong. It did not flag three impure calls
  into `data.js` (an updater, a module cursor, a cache), which cross a module
  boundary.

### Every React app in the repo

The React variants of 17 more benchmark apps, migrated from `868ee70aaa` and
run through each app's own harness (2026-10-29, six runs in parallel, so
timings are indicative). The React-hosted apps (`examples/harbor`,
`examples/storybook`, `react-hosted-islands`, `streamdown-hosted`) host Octane
inside React by design and were left alone.

| Apps | Result |
| --- | --- |
| todomvc, uibench, dbmon, recursive-context | pass as emitted; with the fixes below, each matches its TSRX variant in size and speed |
| memo-wall, effectful-list, signal-favoring, portal-swarm | pass as emitted |
| async-composition, async-waterfall, spa-navigation, svg-dashboard | pass as emitted |
| news, bundle-size app shell, tauri-shell | pass after the HTML and `renderToString` fixes |
| three (React Three Fiber) | fails as emitted: the scene needs a `.three.tsrx` module by hand, now reported |
| ssr-workerd, tanstack-start | server-render and pass after binding and config fixes |
| tanstack-com (613 modules) | builds and hydrates 7 routes with 0 errors after 13 hand fixes, most now in the codemod: 0 compile errors and 228/337 Strong |

Codemod defects found, all fixed with tests:

- An early `return <A />` rendered through runtime descriptors: guards now
  become `@if`/`@else` (recursive-context mount 1.9× → 1.03×; 6,142 comment
  nodes → 0 in spa-navigation).
- `root.render(<App />)`, `root.render(createElement(App, props))` and
  `hydrateRoot(c, <App />)` kept the generic element renderer (7–21 kB gzip per
  app); they now mount `App` directly.
- `renderToString` returned `{ html, css }` where React code expects a string;
  `.html` is added.
- `const any = n > 0; {any && <b />}` stayed a hole (12.8 kB in todomvc).
- Only `index.html` was updated; every page is now, and `~/` alias imports get
  `.tsrx` like relative ones.
- `react-dom/server.edge` and `@tanstack/react-start` had no mapping.
- The TanStack document shell kept `<html>`, so nothing hydrated; it now uses
  the router's `Html`/`Head`/`Body`.
- Two provider shapes (a context made on either branch, `C.Provider` as a
  value), type-only React imports emitted as values, a `.map()` with an outer
  `n++` turned into `@for`, `/*` in element text read as a comment, and
  `typeof children === 'function'` without `isChildrenBlock`.
- `flushSync` and React Three Fiber are now reported; `@tsrx/react` files are
  reported instead of skipped.

Still open, owned elsewhere:

- **Compiler:** `root.render(<App />)` through a variable or `flushSync`, and
  `memo` around a local component, lose component-slot proofs (13–23 kB); a
  template `@if` can make hydration fall back to a client render with no
  diagnostic; `.tsrx` keeps imports of type-only names; an `@for` row writing an
  enclosing `let` compiles without a diagnostic; Strong renders a `useState`
  component through a lite slot that re-runs its ancestors (1.4–1.5×).
- **Bindings:** TanStack `Await` always installs a boundary, `StartClient` takes
  `{ router }` where React's takes nothing, and deferred content never reveals
  under a raw `<html>` root; Radix `asChild` cannot clone template children.
- **CLI:** `octane init` should add `**/*.tsrx` to a tsconfig `include`.
- **Codemod, later:** an early `return items.map(…)` is not lowered; `.jsx`
  holes stay bare without types; class components; `@radix-ui/react-*` and
  upstream adapters (`@tanstack/react-hotkeys`) are not in the catalog.

## Workstreams

Each workstream ships as its own PR with golden fixtures and corpus numbers in
the description. Ordered by what unblocks the most real code.

### 1. Correctness hardening (done)

Every name is resolved through its declaration, not its spelling, so a shadowed
`React`, `useState`, or event parameter is never rewritten.

- Each module is bound by a single-file TypeScript program (the ES5 library
  only, no module resolution); React imports, namespaces, event parameters,
  contexts, and the global `JSX` resolve through the checker. Added imports are
  aliased when they would shadow a module declaration or a global the module
  reads (the DOM's `MouseEvent` beside an Octane `MouseEvent` type).
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
- Text holes: the cast itself landed in M1 (`template-text`, above), with
  the project program it needs for imported types. Still to do: merge adjacent
  static text and proven-string holes into one text binding, as the
  hand-written HN twin does (`{'(' + host + ')' as string}`), and measure the
  corpus apps.
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
- `memo(C, compare)`: drop the comparator when it compares a subset of props
  by identity and the props it omits are provably stable, so the component
  regains the row skip and list cache; otherwise report its cost.
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
| M1 (in progress) | Workstream 1 (done), HN lane (done), TS2300 fix (done, #2265), text-hole casts (done), first publish as `0.1.0` | 0 compile errors on corpus (done); HN spec green on migrated output (done: 10/10 journeys); idempotent (done) |
| M2 | Workstream 2 (types) | HN output matches the hand-written twin's holes and `@if`s wherever React's behavior allows (not its casts of optional fields); merged text bindings measured |
| M3 | Workstreams 3 + 4 | Error boundaries and simple classes convert; `react-classes` passes the js-framework harness; radix adapter; `octane migrate`; bulletproof-react tests pass after migration |
| M4 | Workstream 5 | Strong share on the corpus up from 77%, each fixer owned by the compiler |
| M5 | Workstream 6, docs page on octanejs.dev | Migration guide built from real corpus before/after |

## Open questions

- **Name.** The prototype is `@octanejs/codemod` with an `octane-codemod` bin,
  matching `@octanejs/cli`. Publish an unscoped `octane-codemod` alias too?
- **JavaScript projects.** A `.jsx` module becomes `.tsrx` with
  `// @ts-nocheck`, so it stays unchecked, as JavaScript was. A JS-only project
  still gains files its tooling treats as TS; a JS flavor of TSRX would remove
  that.
- **Default aggressiveness.** Ship behavior-preserving by default with a
  `--idiomatic` flag for rewrites like `{n && <X />}` → `@if (n)`, or make
  type-aware proofs good enough that the flag is rarely needed?
- **Render props.** Functions passed as props that return JSX stay plain today.
  Converting them to `() => @{ … }` would put their output on the template
  path; worth it only with a measured gain.
