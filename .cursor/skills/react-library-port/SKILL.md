---
name: react-library-port
description: Port a React ecosystem library to an @octanejs/* binding. Use when adding a new binding package or bringing an existing one closer to upstream parity.
---
# Skill: React-like package bridge/port into Octane compatibility

Use this when asked to port or bridge a React ecosystem package into Octane, add an `@octanejs/*` binding, or evaluate whether a React package can run on Octane.

## Mental model

Do **not** assume React component code can run unchanged. Octane is compiler-first:

- React JSX output and slotless hook calls are not valid Octane component runtime input.
- Reuse framework-agnostic cores unchanged.
- Re-implement thin React bindings with Octane hooks.
- Re-author representative UI tests/fixtures in `.tsrx` and compare behavior to React when possible.

A binding is a **port of a specific upstream release**, not an
Octane-flavored library that borrows the name. Work from the upstream source at a
pinned version, module by module, and account for every export it publishes. A
subset that covers the demo path is not a port, and neither is a rewrite from
memory of the README.

Read first:

1. `AGENTS.md`
2. `docs/react-library-compat-plan.md`
3. `docs/react-parity-testing.md`
4. `docs/differences-from-react.md`
5. Existing closest binding in `packages/{zustand,query,motion,stylex,router,lexical,floating-ui,radix}/`
6. `packages/three/UPSTREAM.md` for the pin, source-boundary, and crosswalk format
7. `vitest.config.js` aliases/exclusions for existing binding packages

## Workflow

1. **Classify the target library**
   - Find its vanilla/core package or pure internal layer.
   - Identify the React binding surface: hooks, components, providers, portals, refs, event handling.
   - Note unsupported React assumptions: class components, `forwardRef`, synthetic events, React-style text `onChange`, StrictMode-only behavior, React internals. Controlled `value`/`checked` itself is supported.

2. **Pin the upstream release and bring its source into the repository**
   - Inspect both the published package contents (`npm pack --dry-run` or the equivalent) and the canonical repository at the release tag. Do not assume the registry artifact contains source, tests, build scripts, or even the same file layout as the repository. If source or tests are absent from the package, fetch them from the canonical tagged repository and record which artifact supplied each boundary.
   - Pick one immutable upstream release and record it in `packages/<name>/UPSTREAM.md`: package, exact version, tag commit SHA, the supported upstream range the port advertises, and any peer or oracle versions (`packages/three/UPSTREAM.md` is the model).
   - Vendor the upstream React-facing source at that pin under `packages/<name>/upstream/`, byte-exact and unmodified, keeping the upstream directory layout, its LICENSE, and its copyright headers. `.prettierignore` already covers `packages/*/upstream/`, so vendored bytes stay unformatted; leave the directory out of the package's published `files` so it remains development evidence rather than shipped code.
   - Confirm the upstream license permits that redistribution before vendoring. When it does not, work from a checkout pinned to the same commit outside the repository and say so in `UPSTREAM.md`; everything below still applies.
   - Mirror that layout in `src/`, so each Octane module sits at the path of the upstream module it replaces and a reviewer can read the two side by side. Where a framework-neutral core is reused verbatim, say so in the crosswalk instead of vendoring it.
   - Port module by module against the vendored source, not from the README, the type declarations, or memory. The vendored tree is also what makes an upstream upgrade reviewable: re-vendor at the new pin, and the diff between the two trees is the work list.

3. **Create or update package shape**
   - New ports belong under `packages/<name>/` with `package.json`, `src/`, `tests/`, `tsconfig.json`, `UPSTREAM.md`, and README.
   - Public package should normally be `@octanejs/<name>`.
   - Add workspace/test aliases in `vitest.config.js` following existing packages.
   - Configure parity ownership declaratively as described in
     `docs/react-parity-testing.md`: use
     `testExecution: { group: 'react-parity' }` when the dedicated runner owns
     the complete project, or add `testExecution.include` containing only the
     parity-owned patterns when ordinary package tests share that project. The
     base `test.include` remains the complete local project.
   - Never add a binding name/path to `ci.yml`, a package-specific parity job or
     exclusion environment variable, or shard/Node/job details to
     `testExecution`. `vitest.ci-sharded.config.js` derives the ordinary-shard
     complement from the ownership metadata.
   - Add catalog dependencies to `pnpm-workspace.yaml` only when needed.

4. **Reuse core, reimplement binding**
   - Prefer importing the target's vanilla/core package unchanged.
   - Implement hooks with Octane equivalents: `useSyncExternalStore`, `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useContext`, `createContext`, `createPortal`, `flushSync`, `use`.
   - `useDebugValue` can be a no-op shim unless devtools behavior is explicitly in scope.
   - Rewrite `forwardRef` to React 19 refs-as-props (`ref` is a prop in Octane).
   - For cross-file custom hooks imported by `.tsrx`, check whether the compiler must auto-slot them or whether the package source should be excluded and forward slots via `subSlot` like `floating-ui`.

5. **Crosswalk every upstream export**
   - `UPSTREAM.md` carries a row for every export of the pinned upstream React entry points, classified as ported, reused verbatim from a framework-neutral core, divergence, or not applicable, each with its evidence (the test that proves it, or the reason it cannot apply to Octane).
   - An export that is not done yet is an explicit gap row with what is missing. Silence is what turns a subset into an accidental parity claim.
   - `status.json` must agree with the crosswalk: `surface` describes what is covered, and `divergences` lists what a consumer would notice. `pnpm bindings:status` regenerates `docs/bindings-status.md` from it.

6. **Run the pinned release's own tests**
   - First prove what test suite actually exists at the pin. Inspect the repository, package scripts, workspaces, fixtures, snapshots, and test configuration rather than inferring coverage from filenames or the published package. Record when a release genuinely ships no tests; “tests were not present in the npm tarball” is not evidence that the repository has none.
   - When upstream ships a suite, it is the strongest parity oracle available, because it encodes behavior the maintainers care about rather than behavior the port happened to think of. Start there instead of writing fresh tests around the implementation you just wrote.
   - Run its framework-neutral suites unmodified against the core the port reuses. A failure there means the port broke the core's contract, not that the test needs adjusting.
   - Port its React-binding suites case by case: re-author the fixtures in `.tsrx`, swap `@testing-library/react` for `@octanejs/testing-library`, keep the upstream case name, and cite the origin like the conformance suite does (`// Per <upstream path>:<line>`). `node scripts/scaffold-react-port.mjs <react-test-file>` emits a triage checklist to work from.
   - `UPSTREAM.md` records the disposition of every upstream test file: run as-is, ported (and where it now lives), or out of scope with the reason (React internals, `react-test-renderer`, StrictMode double-invoke, an API Octane does not expose). Vendor the upstream tests alongside the source when their license allows it, so the next pin is a diff there too.
   - A committed test must execute, so `.skip`, `it.todo`, and expected-failure markers are not how an unported case is tracked; the crosswalk is (`pnpm test:markers:check`).
   - Never weaken an upstream assertion to make it pass. Triage it in step 8, and if the answer is a divergence, keep the case and assert Octane's behavior with an `// OCTANE DIVERGENCE:` rationale.
   - Test the parity machinery itself. Add negative controls proving that a removed, renamed, skipped, stale, or unexecuted upstream case fails validation, and that provenance or fixture drift cannot leave the harness green. A green port suite without these controls proves behavior only if the evidence collector is already assumed correct.
   - Classify every test in both directions. Every upstream test artifact needs a recorded disposition, and every port-authored test needs exactly one classification: unmodified upstream, adapted upstream, React/Octane differential, Octane-only divergence/framework contract, or not applicable with a reason.
   - Every port-authored test used to support a React-parity claim must run the same observable scenario against the pinned React implementation or cite the pinned upstream test that covers it. Octane-only divergence and framework-contract tests must say why they are unpaired and must not be counted as React-parity evidence.
   - Treat upstream type tests as executable parity evidence, not merely inspiration. Run the vendored suite unchanged with its original compiler and pinned React type dependencies, run a one-for-one adapted suite with the Octane compiler configuration, and require equivalent accept/reject results except for explicit divergences.
   - Inventory and hash both type suites at file and assertion-group granularity. Record the exact allowed transformations (for example import roots, `.tsx`/`.tsrx` component paths, or a documented event-name mapping), reject every other structural change, and add negative controls for a skipped file, deleted assertion, and removed `@ts-expect-error`.
   - Register pristine and adapted runtime and type lanes in
     `packages/<name>/audit/react-parity.json`. `react-parity:check` discovers
     package manifests automatically; do not create a package-specific CI entry
     point. A locally runnable helper that the generic React parity job never
     invokes is not parity evidence.
   - Make every Vitest-backed `lane.project` match a project name in
     `vitest.config.js`. Keep parity lane files inside `testExecution.include`
     for a mixed project, and keep Octane-only conformance/framework-contract
     files outside it so the general shards still execute them.

7. **Build test strategy for what upstream does not cover**
   - DOM output over event sequences: use differential tests where the same `.tsrx` fixture runs in Octane and React.
   - Render-count, subscription, effect-order, bailout, and ref lifecycle: use Octane-only conformance tests.
   - Keyed reorder node identity: use identity helpers; do not rely on `innerHTML`.
   - Async/Suspense: make timer/microtask draining explicit and deterministic.

8. **Triage divergence**
   - Classify each failure as:
     - Octane bug
     - Intentional divergence
     - Environment/jsdom artifact
     - Porting/test harness issue
   - Record genuine gaps in docs or tests before changing runtime/compiler.
   - Where parity is genuinely unreachable (React internals, the synthetic event
     layer, class components, StrictMode double-invoke), the divergence is the
     deliverable: record it in `UPSTREAM.md` and `status.json` with the reason,
     what a consumer should do instead, and a passing behavioral test that pins
     the Octane behavior. An unreachable API is never a reason to quietly drop
     the export.
   - Preserve public/library callbacks named `onChange`. Rewrite only standard
     text-host wiring that means “every edit” to `onInput`; keep select and
     checkbox/radio native change handlers. A real text commit may use
     `suppressNativeChangeWarning` with a behavioral test.

9. **Validate**
   - Run package-specific tests first.
   - Run the local and sharded views of every mixed parity project as described
     in `docs/react-parity-testing.md`; the latter must execute only the
     non-parity complement.
   - Run affected core tests if touching `packages/octane`.
   - Run `pnpm typecheck` for API/package changes.
   - Run `pnpm react-parity:check` for binding work and confirm every required manifest lane executes rather than only validates metadata.
   - Run `pnpm format:files <path...>` while iterating and
     `pnpm format:files:check <path...>` for a scoped check. Use the repo-wide
     `pnpm format:check` for the final gate.

## Deliverables

- `packages/<name>/upstream/*`: the pinned upstream source, byte-exact, with its
  LICENSE, prettier-ignored, and unpublished.
- `packages/<name>/UPSTREAM.md`: the pin (package, version, tag commit,
  advertised range, oracle versions), the source boundary, the export crosswalk
  with evidence, and the disposition of every upstream test file.
- `packages/<name>/src/*` binding implementation, laid out to mirror the upstream
  modules it replaces.
- `status.json` whose `surface` and `divergences` match the crosswalk.
- The pinned release's own suites run against the port: its framework-neutral
  tests unmodified, its React-binding tests ported case by case, and every
  recorded divergence pinned by a test.
- Pristine and adapted type suites, hashed assertion inventories, permitted
  transformation ledger, negative controls, and exhaustive port-test
  classifications wired into `react-parity:check` and the generic React parity
  execution group.
- README with compatibility status and intentional differences.
- Changeset if user-facing package behavior changed.
- Optional update to `docs/react-library-compat-plan.md` scorecard.

Existing bindings predate this requirement and are not all pinned and vendored
yet. Bring a package up to it when you next touch it, and say in the handoff
which exports the crosswalk still leaves open.
