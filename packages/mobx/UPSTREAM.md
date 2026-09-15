# MobX React Lite upstream contract

The React binding target is MIT-licensed `mobx-react-lite@5.0.3`, commit
`5dbb04a15f7eb0ef6b844904c43955357a9bbdfc` in
[mobxjs/mobx](https://github.com/mobxjs/mobx/tree/5dbb04a15f7eb0ef6b844904c43955357a9bbdfc/packages/mobx-react-lite).
`audit/upstream.lock.json` authenticates the complete package source and test
subtree. `upstream-artifact/` retains the exact npm tarball and its published
metadata, license, and declarations; `audit/provenance.json` authenticates those
bytes. `LICENSE.upstream` preserves the upstream MIT notice.

The framework-neutral core is the ordinary `mobx@7.0.3` dependency. Its exports
are re-exported directly, with no copied core implementation. This is a major
core upgrade from MobX 6: applications that also import `mobx` should use a
compatible MobX 7 dependency so both imports share one core instance.

## Source boundary

The copied and rewritten boundary is `packages/mobx-react-lite/src` from the
pinned monorepo package. Native `src/` mirrors those observer, local-observable,
static-rendering, and finalization modules; `src/internal.ts` supplies Octane's
manual hook slots. The upstream one-line `noop` helper is represented inline by
`clearTimers`' native-registry fallback. MobX core implementation is imported
from the ordinary dependency and is not copied. `audit/closure.json` records
every shipped source hash and the runtime dependency closure, including the
binding's own exported package metadata.

The immutable package subtree is test/provenance evidence only. Its React
bundles, original tests, adapted patches, and previous-binding type witness are
excluded from the published package. The npm artifact and its declarations are
kept separately from the lock-verified repository bytes.

## Public exports

| Upstream entry or symbol                               | Octane contract                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `observer`                                        | Native memoized function components; preserves generic props and enumerable custom statics.                                                                   |
| Root `Observer`                                        | Native render region; `children` and `render` are mutually exclusive callbacks.                                                                               |
| Root `useLocalObservable`                              | Native local state with MobX auto-observation, including typed `Map` stores and annotation options.                                                           |
| Root `enableStaticRendering`, `isUsingStaticRendering` | Shared static-rendering switch; SSR avoids creating reactions and subscriptions.                                                                              |
| Root `_observerFinalizationRegistry`, `clearTimers`    | Native finalization registry with the upstream timer fallback; `clearTimers` has the precise `() => void` type.                                               |
| `./package.json`                                       | Exposes this binding's own package metadata.                                                                                                                  |
| `./src/*`                                              | Upstream implementation paths are not Octane public entry points. The corresponding native modules live in `src/`; supported APIs are exported from the root. |
| `./dist/*`                                             | React bundles, declarations, and build-format paths are not Octane entry points. Octane publishes authored source through the root.                           |

The existing Octane `useObserver`, deprecated `useStaticRendering`,
`ObserverProps`, and `ObserverComponent` exports remain available. Their original
source contract is retained in `audit/compatibility-baseline.json` and its
hash-matched artifact. MobX 5's removal of React's legacy hook alias does not
remove the Octane alias.

## Deliberate renderer differences

Refs are ordinary Octane props. The adapted imperative-ref case calls the
handle, checks focus, and checks its element type without React `forwardRef`.
React's class components, class error boundaries, legacy context,
`Provider`/`inject`, React batching, DevTools, and debug-value integration are
outside this function-component binding. Error tests use Octane's native error
boundary while retaining the observable failure and recovery assertions.

Octane does not double-invoke components in StrictMode. One upstream case
mutates an observable during its first tracking callback and relies on React's
extra StrictMode render to display that mutation immediately. The native case
checks the initial render and then an explicit rerender. A separate control
against the pinned React 19.0.0 runner confirms that React without StrictMode
also displays the initial value. Ordinary external-store updates, render errors,
abandoned observers, finalization, and unmount cleanup retain their assertions.

Octane's element markers and memo representation differ from React's. Adapted
DOM assertions check visible rows and their order; native browser tests also
check surviving node identity, focus, ref cleanup, and subscription disposal.
The immutable React snapshots remain unchanged.

## Evidence

The pinned upstream suite has 71 source registrations. A helper executes its
21 cases twice, producing 92 runtime cases: 90 active and two already skipped
upstream. Both the pristine and adapted suites retain those two skips (timer-based reaction recreation and legacy context). The adapted legacy
context body is omitted because Octane has no React class context API.

Pristine Jest runs every original runtime file and snapshot with React 19.0.0.
The full pristine and adapted TypeScript programs compile the original and
materialized TSX tests, including their positive and negative type assertions.
Pristine React declarations are pinned to `@types/react@18.3.3` and
`@types/react-dom@18.3.0`, as in the release's lockfile. Separate public consumer
probes exercise the installed npm declarations and the native exported APIs.

Native `.tsrx` regressions cover all three observation callback forms and
retention after rerender. A shared React/Octane fixture checks action updates.
Chromium checks input events, keyed row identity, focus, refs, and cleanup.
SSR/hydration checks static rendering without subscriptions, reuse of server
nodes, live updates after hydration, and unmount disposal.
