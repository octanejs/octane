# React Redux upstream

`@octanejs/redux` ports the React-facing Provider and hooks API from
[`react-redux@9.3.0`](https://github.com/reduxjs/react-redux/releases/tag/v9.3.0)
over Octane's external-store primitive.

## Immutable pin

- Package: `react-redux@9.3.0`
- Tag and commit: `v9.3.0` / `4134f88f179c46d3ae9c4ee7baaa589ff0fecfa8`
- Repository: `https://github.com/reduxjs/react-redux.git`
- Source root: `src`
- Test root: `test`
- License: MIT
- npm archive SHA-256: `947436d0e52a8f4fa348aaf5708eafc8ae8395b986229f0fce5c91c81011c805`
- Supported upstream range: exactly `9.3.0`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`

The npm archive publishes source, declarations, ESM, CJS, React Server, and
React Native entry points, but not the repository test suite. The pinned
runtime and type suites have not been vendored or adapted one-for-one, so the
manifest remains `recorded-unverified`.

## Public surface crosswalk

| Upstream entry point or export | Octane disposition | Evidence or gap |
| --- | --- | --- |
| Root `react-redux` entry point | Ported with extensions | Local export-surface test rejects missing pinned runtime exports; it intentionally permits the extension exports listed below. |
| `Provider` and `ReactReduxContext` | Ported | Local Provider, nested-context, and hook conformance coverage. |
| `useSelector`, `useDispatch`, and `useStore` | Ported | Local selector/store coverage plus the bounded counter differential. |
| `createSelectorHook`, `createDispatchHook`, and `createStoreHook` | Ported | Local isolated-store coverage. |
| `shallowEqual` | Ported | Local selector equality coverage; exhaustive upstream utility cases remain open. |
| `batch` | Ported as passthrough | Matches the upstream React 18+ no-op contract; not independently differential-tested. |
| `connect` and `legacy_connect` | Compatibility stubs | Exports exist but intentionally throw because Octane has no class-component HOC model. |
| `./alternate-renderers` | No distinct Octane subpath | Upstream resolves this to the same implementation; Octane exposes the root binding only. |
| `react-server` condition | No distinct Octane condition | The binding has no dedicated server-only module; SSR parity remains open. |
| `react-native` condition | Not ported | Octane targets the DOM renderer. |
| `./package.json` | Not exported | The Octane package export map exposes only its root runtime entry; package metadata subpath parity remains open. |
| `createReduxContextHook`, `useReduxContext`, `createSubscription`, and `useSyncExternalStoreWithSelector` | Octane extension exports | Public Octane helpers beyond the pinned upstream root namespace; explicitly documented rather than counted as exact export parity. |

Error messages are Octane-branded. These known consumer-facing differences and
the throwing HOC exports remain explicit in `status.json`; the bounded
differential does not claim to verify them.

## Upstream suite disposition

| Pinned artifact | Current disposition |
| --- | --- |
| `test/components/Provider.spec.tsx` | Not adapted one-for-one; local Provider coverage exists. |
| `test/components/connect.spec.tsx` | Not adapted; `connect` intentionally throws. |
| `test/components/hooks.spec.tsx` | Not adapted one-for-one; local hook coverage exists. |
| `test/hooks/hooks.withTypes.test.tsx` | Not adapted one-for-one; local runtime coverage exists. |
| `test/hooks/useDispatch.spec.tsx` | Not adapted one-for-one; local dispatch coverage exists. |
| `test/hooks/useReduxContext.spec.tsx` | Not adapted one-for-one; local context coverage exists. |
| `test/hooks/useSelector.spec.tsx` | Not adapted one-for-one; local selector coverage and bounded differential exist. |
| `test/integration/dynamic-reducers.spec.tsx` | Not adapted one-for-one. |
| `test/integration/server-rendering.spec.tsx` | Not adapted; dedicated server-render evidence remains open. |
| `test/integration/ssr.spec.tsx` | Not adapted; dedicated SSR evidence remains open. |
| `test/utils/Subscription.spec.ts` | Not adapted one-for-one; local dispatch behavior exercises the ported subscription. |
| `test/utils/isPlainObject.spec.ts` | Not adapted; helper behavior is not part of the published runtime surface. |
| `test/utils/shallowEqual.spec.ts` | Not adapted one-for-one; local equality coverage exists. |
| `test/typetests/connect-mapstate-mapdispatch.test-d.tsx` | Not adapted; the HOC surface intentionally diverges. |
| `test/typetests/connect-options-and-issues.test-d.tsx` | Not adapted; the HOC surface intentionally diverges. |
| `test/typetests/hooks.test-d.tsx` | Not adapted one-for-one; exhaustive type parity remains open. |
| `test/typetests/hooks.withTypes.test-d.tsx` | Not adapted one-for-one; exhaustive type parity remains open. |
| `test/typetests/provider.test-d.tsx` | Not adapted one-for-one; exhaustive type parity remains open. |
| `test/typetests/react-redux-types.test-d.tsx` | Not adapted; exhaustive type parity remains open. |
| `test/setup.ts` | Upstream runner support, not an executable test artifact. |
| `test/typeTestHelpers.ts` | Upstream type-test helper, not an executable test artifact. |
| `test/typetests/counterApp.ts` | Upstream type-test fixture, not an executable test artifact. |

## Bounded evidence

The `redux-runtime-differential` lane compiles the same counter `.tsrx`
fixture for React and Octane. It compares byte-identical DOM after mount, two
increments, and one decrement. Exact test identity selection is fail-closed.
This single case does not establish exhaustive parity for the Provider, hook,
SSR, native, HOC, or type surfaces.
