# Upstream

- Package: `react-intersection-observer@11.0.1`
- Supported upstream range: `11.0.x`
- Repository: https://github.com/thebuilder/react-intersection-observer
- Source subtree: `packages/react-intersection-observer`
- Immutable commit: `aa231b3a23ec000db0edb434693f9661ff422970`
- License: MIT
- React oracle: `react-intersection-observer@11.0.1` with React `19.2.7` / ReactDOM `19.2.7` (`catalog:default`; keep immutable for this pin)

## Source boundary

The npm package publishes compiled output and declarations rather than its
authored source and tests. The complete pinned package subtree is therefore committed
byte-exact under `upstream/` and pinned by `audit/upstream.lock.json`, which
records each file's git blob sha — its content address in the upstream
repository — so the committed copy verifies offline against the pinned commit
(`pnpm react-port:materialize run --check`). The adapted suite regenerates into
`tests/upstream/` (git-ignored) from the pristine bytes plus the lock's
mechanical `adaptedRewrites` and the committed divergence patches in
`audit/upstream-patches/`; a mapped file with no patch runs byte-identical to
upstream after the declared rewrites. The upstream MIT license is retained
byte-exact as `LICENSE.upstream`, hash-matched to the lock and npm artifact. The repository MIT license is retained as `LICENSE`. The npm tarball and declarations are hash-pinned by `audit/provenance.json` under unpublished `upstream-artifact/`.

## Export crosswalk

| Upstream export | Octane status | Evidence / divergence |
| --- | --- | --- |
| `InView` | Ported | `tests/intersection-observer.test.ts`; class state/lifecycles are expressed with Octane hooks and refs-as-props. |
| `useInView` | Ported | `tests/intersection-observer.test.ts` |
| `useOnInView` | Ported | `tests/intersection-observer.test.ts` |
| `observe` | Ported | `tests/intersection-observer.test.ts`; observer pooling is framework-neutral. |
| `defaultFallbackInView` | Ported | `tests/intersection-observer.test.ts` |
| `./test-utils` runtime exports | Ported with setup divergence | `src/test-utils.ts` and `tests/intersection-observer.test.ts`; does not auto-register Vitest/Jest `beforeEach`/`afterEach` — call `setupIntersectionMocking`/`resetIntersectionMocking` yourself. |
| `IntersectionObserverInitWithOptions` | Ported | `src/types.ts` |
| `ObserverInstanceCallback` | Ported | `src/types.ts` |
| `IntersectionChangeEffect` | Ported | `src/types.ts` |
| `IntersectionOptions` | Ported | `src/types.ts`; React-owned node/ref fields are replaced with structural Octane/DOM types. |
| `IntersectionObserverProps` | Ported with its upstream name; `InViewProps` remains available | `src/types.ts`; the public render-prop and wrapper modes are preserved. |
| `PlainChildrenProps` | Ported with its upstream name | `src/types.ts` |
| `InViewHookResponse` | Ported | `src/types.ts` |
| `IntersectionEffectOptions` | Ported | `src/types.ts` |

## Upstream test disposition

| Upstream artifact | Disposition |
| --- | --- |
| `src/__tests__/observe.test.ts` | Adapted one-for-one in `tests/upstream/observe.test.ts`; pristine + adapted inventories registered. |
| `src/__tests__/useInView.test.tsx` | Adapted one-for-one in `tests/upstream/useInView.test.tsx`. |
| `src/__tests__/useOnInView.test.tsx` | 24 applicable cases adapted in `tests/upstream/useOnInView.test.tsx`; the 11 private React-version detection registrations execute only in the unchanged oracle because Octane always supports ref cleanup. |
| `src/__tests__/InView.test.tsx` | Adapted one-for-one in `tests/upstream/InView.test.tsx`. |
| `src/__tests__/useInView.ssr.test.ts` | Runs unchanged in Node against React and with the explicit Octane server-result `.html` adaptation against Octane. |
| `src/__tests__/setup.test.ts` | Adapted one-for-one in `tests/upstream/setup.test.ts`. |
| `src/__tests__/browser.test.tsx` | Pristine browser lane `intersection-observer-pristine-browser` runs the vendored suite under Vitest browser/Playwright; adapted one-for-one in `tests/upstream/browser.test.tsx` via `intersection-observer-adapted-browser`. |

Native contract tests and actual SSR hydration are inventoried under the parity-owned `intersection-observer` project. Parity evidence is owned by the
`intersection-observer-pristine`, `intersection-observer-adapted`, `intersection-observer-adapted-ssr`,
`intersection-observer-pristine-browser`, and
`intersection-observer-adapted-browser` projects and
`packages/intersection-observer/audit/react-parity.json`.

## Intentional divergences

- `intersection-observer-initial-false-onchange` (runtime): When Intersection
  Observer is unsupported and the fallback is `false`, upstream's class `InView`
  often observes twice under React, so the initial-false skip can still let an
  `onChange(false)` through. Octane observes once, so that notification is
  suppressed. Treat unsupported false as the default hidden state rather than
  waiting for `onChange(false)`. Recorded in
  `packages/intersection-observer/audit/react-parity.json` and `status.json`.
- `intersection-observer-unsupported-mount-error-surface` (runtime): Upstream
  class/`useInView` mount throws synchronously when IntersectionObserver is
  missing and no fallback is set. Octane observes during client ref commit, so
  the same `IntersectionObserver is not a constructor` error is reported via
  `console.error` / `tryBlock` rather than a try/catch around `render`. Prefer
  `fallbackInView` / `defaultFallbackInView`, or an error boundary.
- `intersection-observer-test-utils-manual-setup` (test-utils): Upstream
  `test-utils` auto-wires Vitest/Jest `beforeEach`/`afterEach` when those
  globals exist. The Octane binding requires an explicit
  `setupIntersectionMocking` / `resetIntersectionMocking` pair in the consumer
  test setup file, including under Vitest.

- `intersection-observer-ref-cleanup-version`: Octane ref callbacks always
  support cleanup functions. The exact 11 React-version table rows are retained in
  the pristine suite, classified as inapplicable in the registration crosswalk,
  and excluded by an exact-title crosswalk that rejects partial or duplicate tables.
- `intersection-observer-profiler`: The two performance cases retain the original
  component-render and observer-construction assertions. Their React Profiler
  commit callback is inapplicable to Octane and is removed explicitly in the patch.
- `intersection-observer-ssr-result`: Octane's server renderer returns a result
  object; the adapted original SSR case reads `.html` before its unchanged assertion.

The original suite contains 98 registrations: 96 unit/Node SSR and two Chromium
browser cases. Octane executes 87 adapted cases after the 11 private React-version
rows are excluded, plus 21 native cases for pooling, ref lifetime, repeated
cleanup, target replacement and actual hydration. No skipped or focused tests
are accepted. All unchanged upstream TypeScript sources and tests compile in the
strict pristine project. Separate strict adapted, authored and public projects
retain precise public export assertions and negative controls; the same installed
package contracts compile in the Node and browser pack consumers. Repository
authored paired type probes are identified as such, not counted as upstream tests.

The complete pre-update native source and manifest are retained under
`upstream-artifact/previous-binding` and authenticated against the campaign's
pre-edit receipt. `audit/compatibility-baseline.json` preserves the native
function-component contract and the existing `InViewProps`/`InViewRenderProps`
compatibility names; new upstream named exports use the pinned 11.0.1 declarations.

Native target replacement also reads the latest `initialInView` value after prop updates, without rebuilding a stable ref just to refresh that value.
