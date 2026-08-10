# Redux Toolkit upstream

`@octanejs/redux-toolkit` ports the React-specific adapters from
[`@reduxjs/toolkit@2.12.0`](https://github.com/reduxjs/redux-toolkit/releases/tag/v2.12.0)
while re-exporting the pinned framework-neutral Toolkit and RTK Query cores.

## Immutable pin

- Package: `@reduxjs/toolkit@2.12.0`
- Tag and commit: `v2.12.0` / `576a02f8056fbee2dcaddb4d2e4d2da3b7937c58`
- Repository: `https://github.com/reduxjs/redux-toolkit.git`
- Source root: `packages/toolkit/src`
- Test root: `packages/toolkit/src`
- License: MIT
- npm archive SHA-256: `8cd62ba6cf128a4c7f13c304625ee8a3cadd9383f8e0c97e081dfa0d72718d68`
- Supported upstream range: exactly `2.12.0`
- React oracle: `react@19.2.7`, `react-dom@19.2.7`, and `react-redux@9.3.0`

The npm archive publishes four compiled entry points, declarations, and source,
but not the repository test suite. The pinned runtime and type suites have not
been vendored or adapted one-for-one, so the manifest remains
`recorded-unverified`.

## Public surface crosswalk

| Upstream entry point | Octane disposition | Evidence or gap |
| --- | --- | --- |
| `@reduxjs/toolkit` | Re-exported unchanged | Exact bidirectional export test and identity checks for representative core APIs. |
| `@reduxjs/toolkit/query` | Re-exported unchanged | Exact bidirectional export test and identity checks for representative RTK Query core APIs. |
| `@reduxjs/toolkit/react` | Ported adapter | Exact export test and local dynamic-middleware coverage; implementation uses `@octanejs/redux`. |
| `@reduxjs/toolkit/query/react` | Ported adapter | Exact export test, local query/SSR/hydration coverage, and three bounded differential cases. |
| `./package.json` | Not exported | The Octane export map exposes its four runtime entry points only; metadata subpath parity remains open. |
| Browser, React Native, module-sync, and CJS conditions | No distinct Octane builds | Octane publishes source entry points; conditional-build parity is outside this bounded lane. |

`useDebugValue` is Octane's no-op compatibility hook, and React-specific names
are retained while using Octane and `@octanejs/redux` internally. These known
adaptations remain explicit in `status.json`.

## Upstream runtime-suite disposition

Every pinned runtime artifact below is present upstream and not adapted
one-for-one. Framework-neutral behavior is consumed from the pinned package;
React-specific bounded evidence is described separately.

| Upstream area | Executable artifacts |
| --- | --- |
| `dynamicMiddleware/tests` | `index.test.ts`, `react.test.tsx` |
| `entities/tests` | `entity_slice_enhancer.test.ts`, `entity_state.test.ts`, `sorted_state_adapter.test.ts`, `state_adapter.test.ts`, `state_selectors.test.ts`, `unsorted_state_adapter.test.ts`, `utils.spec.ts` |
| `listenerMiddleware/tests` | `effectScenarios.test.ts`, `fork.test.ts`, `listenerMiddleware.test.ts`, `listenerMiddleware.withTypes.test.ts`, `useCases.test.ts` |
| `query/tests` | `apiProvider.test.tsx`, `buildCreateApi.test.tsx`, `buildHooks.test.tsx`, `buildInitiate.test.tsx`, `buildMiddleware.test.tsx`, `buildSlice.test.ts`, `buildThunks.test.tsx`, `cacheCollection.test.ts`, `cacheLifecycle.test.ts`, `cleanup.test.tsx`, `copyWithStructuralSharing.test.ts`, `createApi.test.ts`, `defaultSerializeQueryArgs.test.ts`, `devWarnings.test.tsx`, `errorHandling.test.tsx`, `fakeBaseQuery.test.tsx`, `fetchBaseQuery.test.tsx`, `infiniteQueries.test.ts`, `injectEndpoints.test.tsx`, `invalidation.test.tsx`, `matchers.test.tsx`, `optimisticUpdates.test.tsx`, `optimisticUpserts.test.tsx`, `polling.test.tsx`, `queryFn.test.tsx`, `queryLifecycle.test.tsx`, `raceConditions.test.ts`, `refetchingBehaviors.test.tsx`, `retry.test.ts`, `useMutation-fixedCacheKey.test.tsx`, `utils.test.ts` |
| `src/tests` | `actionCreatorInvariantMiddleware.test.ts`, `autoBatchEnhancer.test.ts`, `combineSlices.test.ts`, `combinedTest.test.ts`, `configureStore.test.ts`, `createAction.test.ts`, `createAsyncThunk.test.ts`, `createDraftSafeSelector.test.ts`, `createDraftSafeSelector.withTypes.test.ts`, `createReducer.test.ts`, `createSlice.test.ts`, `getDefaultMiddleware.test.ts`, `immutableStateInvariantMiddleware.test.ts`, `matchers.test.ts`, `serializableStateInvariantMiddleware.test.ts` |

## Upstream type-suite disposition

Every pinned executable type artifact below is present upstream and not adapted
one-for-one. The local `typetests/public-api.test-d.ts` is an Octane-authored
contract test and is not claimed as an upstream suite port.

| Upstream area | Type-test artifacts |
| --- | --- |
| `dynamicMiddleware/tests` | `index.test-d.ts`, `react.test-d.ts` |
| `listenerMiddleware/tests` | `listenerMiddleware.test-d.ts`, `listenerMiddleware.withTypes.test-d.ts` |
| `query/tests` | `baseQueryTypes.test-d.ts`, `buildHooks.test-d.tsx`, `buildMiddleware.test-d.ts`, `buildSelector.test-d.ts`, `cacheLifecycle.test-d.ts`, `createApi.test-d.ts`, `errorHandling.test-d.tsx`, `infiniteQueries.test-d.ts`, `matchers.test-d.tsx`, `queryLifecycle.test-d.tsx`, `retry.test-d.ts`, `unionTypes.test-d.ts` |
| `src/tests` | `Tuple.test-d.ts`, `combineSlices.test-d.ts`, `configureStore.test-d.ts`, `createAction.test-d.tsx`, `createAsyncThunk.test-d.ts`, `createEntityAdapter.test-d.ts`, `createReducer.test-d.ts`, `createSlice.test-d.ts`, `getDefaultEnhancers.test-d.ts`, `getDefaultMiddleware.test-d.ts`, `mapBuilders.test-d.ts`, `matchers.test-d.ts` |

## Upstream support-artifact disposition

| Pinned artifact | Current disposition |
| --- | --- |
| `src/entities/tests/fixtures/book.ts` | Upstream runtime fixture, not an executable test. |
| `src/query/tests/mocks/handlers.ts` | Upstream MSW support, not an executable test. |
| `src/query/tests/mocks/server.ts` | Upstream MSW support, not an executable test. |
| `src/tests/utils/CustomMatchers.d.ts` | Upstream test declaration support, not an executable test. |
| `src/tests/utils/helpers.tsx` | Upstream test helper, not an executable test. |
| `vitest.setup.ts` | Upstream runner support, not an executable test. |
| `vitest.config.mts` | Upstream runner configuration, not an executable test. |
| `tsconfig.test.json` | Upstream type-suite configuration, not an executable test. |

## Bounded evidence

The `redux-toolkit-runtime-differential` lane compiles the same RTK Query
`.tsrx` fixture for React and Octane. It compares query fulfillment and argument
changes, lazy-query and mutation initial/fulfilled outcomes, and infinite-query pagination.
Exact identities for all three cases are fail-closed. This lane does not
establish exhaustive parity for the much larger upstream runtime and type
suites or for conditional package builds.
