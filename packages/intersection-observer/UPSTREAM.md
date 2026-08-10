# Upstream

- Package: `react-intersection-observer@10.1.0`
- Supported upstream range: `10.1.x`
- Repository: https://github.com/thebuilder/react-intersection-observer
- Tag: `v10.1.0`
- Tag commit: `5f82a7328fb63a2e54729f2205278209c14e30e8`
- License: MIT
- React oracle: `react-intersection-observer@10.1.0` with React `19.2.7` / ReactDOM `19.2.7` (`catalog:default`; keep immutable for this pin)

The npm package publishes compiled output and declarations rather than its
authored source and tests. `upstream/` therefore contains the byte-exact `src/`
tree (including tests), package metadata, and license from the canonical tag.
It is development evidence and is excluded from the published `files`.

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
| `IntersectionObserverProps` | Ported as `InViewProps` | `src/types.ts`; the public render-prop and wrapper modes are preserved. |
| `PlainChildrenProps` | Ported as part of `InViewProps` | `src/types.ts` |
| `InViewHookResponse` | Ported | `src/types.ts` |
| `IntersectionEffectOptions` | Ported | `src/types.ts` |

## Upstream test disposition

| Upstream artifact | Disposition |
| --- | --- |
| `src/__tests__/observe.test.ts` | Adapted one-for-one in `tests/upstream/observe.test.ts`; pristine + adapted inventories registered. |
| `src/__tests__/useInView.test.tsx` | Adapted one-for-one in `tests/upstream/useInView.test.tsx`. |
| `src/__tests__/useOnInView.test.tsx` | Adapted one-for-one in `tests/upstream/useOnInView.test.tsx`. |
| `src/__tests__/InView.test.tsx` | Adapted one-for-one in `tests/upstream/InView.test.tsx`. |
| `src/__tests__/setup.test.ts` | Adapted one-for-one in `tests/upstream/setup.test.ts`. |
| `src/__tests__/browser.test.tsx` | Pristine browser lane `intersection-observer-pristine-browser` runs the vendored suite under Vitest browser/Playwright; adapted one-for-one in `tests/upstream/browser.test.tsx` via `intersection-observer-adapted-browser`. |

Ordinary Octane-only contract tests remain in `tests/intersection-observer.test.ts`
outside `testExecution`. Parity evidence is owned by the
`intersection-observer-pristine`, `intersection-observer-adapted`,
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
  missing and no fallback is set. Octane observes inside a passive effect, so
  the same `IntersectionObserver is not a constructor` error is reported via
  `console.error` / `tryBlock` rather than a try/catch around `render`. Prefer
  `fallbackInView` / `defaultFallbackInView`, or an error boundary.
- `intersection-observer-test-utils-manual-setup` (test-utils): Upstream
  `test-utils` auto-wires Vitest/Jest `beforeEach`/`afterEach` when those
  globals exist. The Octane binding requires an explicit
  `setupIntersectionMocking` / `resetIntersectionMocking` pair in the consumer
  test setup file, including under Vitest.
