---
targets: ['*']
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
3. `docs/differences-from-react.md`
4. Existing closest binding in `packages/{zustand,query,motion,stylex,router,lexical,floating-ui,radix}/`
5. `packages/three/UPSTREAM.md` for the pin, source-boundary, and crosswalk format
6. `vitest.config.js` aliases/exclusions for existing binding packages

## Workflow

1. **Classify the target library**
   - Find its vanilla/core package or pure internal layer.
   - Identify the React binding surface: hooks, components, providers, portals, refs, event handling.
   - Note unsupported React assumptions: class components, `forwardRef`, synthetic events, React-style text `onChange`, StrictMode-only behavior, React internals. Controlled `value`/`checked` itself is supported.

2. **Pin the upstream release and bring its source into the repository**
   - Pick one immutable upstream release and record it in `packages/<name>/UPSTREAM.md`: package, exact version, tag commit SHA, the supported upstream range the port advertises, and any peer or oracle versions (`packages/three/UPSTREAM.md` is the model).
   - Vendor the upstream React-facing source at that pin under `packages/<name>/upstream/`, byte-exact and unmodified, keeping the upstream directory layout, its LICENSE, and its copyright headers. `.prettierignore` already covers `packages/*/upstream/`, so vendored bytes stay unformatted; leave the directory out of the package's published `files` so it remains development evidence rather than shipped code.
   - Confirm the upstream license permits that redistribution before vendoring. When it does not, work from a checkout pinned to the same commit outside the repository and say so in `UPSTREAM.md`; everything below still applies.
   - Mirror that layout in `src/`, so each Octane module sits at the path of the upstream module it replaces and a reviewer can read the two side by side. Where a framework-neutral core is reused verbatim, say so in the crosswalk instead of vendoring it.
   - Port module by module against the vendored source, not from the README, the type declarations, or memory. The vendored tree is also what makes an upstream upgrade reviewable: re-vendor at the new pin, and the diff between the two trees is the work list.

3. **Create or update package shape**
   - New ports belong under `packages/<name>/` with `package.json`, `src/`, `tests/`, `tsconfig.json`, `UPSTREAM.md`, and README.
   - Public package should normally be `@octanejs/<name>`.
   - Add workspace/test aliases in `vitest.config.js` following existing packages.
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

6. **Build test strategy**
   - DOM output over event sequences: use differential tests where the same `.tsrx` fixture runs in Octane and React.
   - Render-count, subscription, effect-order, bailout, and ref lifecycle: use Octane-only conformance tests.
   - Keyed reorder node identity: use identity helpers; do not rely on `innerHTML`.
   - Async/Suspense: make timer/microtask draining explicit and deterministic.
   - Cite upstream tests when porting behavior.

7. **Triage divergence**
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

8. **Validate**
   - Run package-specific tests first.
   - Run affected core tests if touching `packages/octane`.
   - Run `pnpm typecheck` for API/package changes.
   - Run `pnpm format:files <path...>` while iterating and
     `pnpm format:files:check <path...>` for a scoped check. Use the repo-wide
     `pnpm format:check` for the final gate.

## Deliverables

- `packages/<name>/upstream/*`: the pinned upstream source, byte-exact, with its
  LICENSE, prettier-ignored, and unpublished.
- `packages/<name>/UPSTREAM.md`: the pin (package, version, tag commit,
  advertised range, oracle versions), the source boundary, and the export
  crosswalk with evidence.
- `packages/<name>/src/*` binding implementation, laid out to mirror the upstream
  modules it replaces.
- `status.json` whose `surface` and `divergences` match the crosswalk.
- Tests that prove core workflows and pin every recorded divergence.
- README with compatibility status and intentional differences.
- Changeset if user-facing package behavior changed.
- Optional update to `docs/react-library-compat-plan.md` scorecard.

Existing bindings predate this requirement and are not all pinned and vendored
yet. Bring a package up to it when you next touch it, and say in the handoff
which exports the crosswalk still leaves open.
