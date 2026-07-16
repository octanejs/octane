# Skill: React-like package bridge/port into Octane compatibility

Use this when asked to port a React ecosystem package into an `@octanejs/*` native binding. Note the baseline first: unmodified React packages already run on Octane through `@octanejs/react-compat` (`octane({ compat: [react()] })`), so a native port is the **performance option**, not a prerequisite for adoption — evaluate a package's out-of-the-box status with the MCP `octane_bridge_react_package` tool before porting anything.

## Mental model

A native binding does not go through the compatibility runtime. On this path, do **not** assume React component code can run unchanged. Octane is compiler-first:

- React JSX output and slotless hook calls are not valid Octane component runtime input.
- Reuse framework-agnostic cores unchanged.
- Re-implement thin React bindings with Octane hooks.
- Re-author representative UI tests/fixtures in `.tsrx` and compare behavior to React when possible.

Read first:

1. `.ai/project-map.md`
2. `docs/react-library-compat-plan.md`
3. `docs/react-parity-migration-plan.md`
4. Existing closest binding in `packages/{zustand,query,motion,stylex,router,lexical,floating-ui,radix}/`
5. `vitest.config.js` aliases/exclusions for existing binding packages

## Workflow

1. **Classify the target library**
   - Find its vanilla/core package or pure internal layer.
   - Identify the React binding surface: hooks, components, providers, portals, refs, event handling.
   - Note unsupported React assumptions: class components, `forwardRef`, synthetic events, controlled inputs, StrictMode-only behavior, React internals.

2. **Create or update package shape**
   - New ports belong under `packages/<name>/` with `package.json`, `src/`, `tests/`, `tsconfig.json`, and README.
   - Public package should normally be `@octanejs/<name>`.
   - Add workspace/test aliases in `vitest.config.js` following existing packages.
   - Add catalog dependencies to `pnpm-workspace.yaml` only when needed.

3. **Reuse core, reimplement binding**
   - Prefer importing the target's vanilla/core package unchanged.
   - Implement hooks with Octane equivalents: `useSyncExternalStore`, `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useContext`, `createContext`, `createPortal`, `flushSync`, `use`.
   - `useDebugValue` can be a no-op shim unless devtools behavior is explicitly in scope.
   - Rewrite `forwardRef` to React 19 refs-as-props (`ref` is a prop in Octane).
   - For cross-file custom hooks imported by `.tsrx`, check whether the compiler must auto-slot them or whether the package source should be excluded and forward slots via `subSlot` like `floating-ui`.

4. **Build test strategy**
   - DOM output over event sequences: use differential tests where the same `.tsrx` fixture runs in Octane and React.
   - Render-count, subscription, effect-order, bailout, and ref lifecycle: use Octane-only conformance tests.
   - Keyed reorder node identity: use identity helpers; do not rely on `innerHTML`.
   - Async/Suspense: make timer/microtask draining explicit and deterministic.
   - Cite upstream tests when porting behavior.

5. **Triage divergence**
   - Classify each failure as:
     - Octane bug
     - Intentional divergence
     - Environment/jsdom artifact
     - Porting/test harness issue
   - Record genuine gaps in docs or tests before changing runtime/compiler.

6. **Validate**
   - Run package-specific tests first.
   - Run affected core tests if touching `packages/octane`.
   - Run `pnpm typecheck` for API/package changes.
   - Run `pnpm format:check` or format changed files.

## Deliverables

- `packages/<name>/src/*` binding implementation.
- Tests that prove core workflows and document known gaps.
- README with compatibility status and intentional differences.
- Changeset if user-facing package behavior changed.
- Optional update to `docs/react-library-compat-plan.md` scorecard.
