# Jotai upstream

`@octanejs/jotai` ports the React-facing layer from
[`jotai@2.20.2`](https://github.com/pmndrs/jotai/releases/tag/v2.20.2) while
reusing Jotai's framework-neutral vanilla implementation.

## Immutable pin

- Package: `jotai@2.20.2`
- Tag and commit: `v2.20.2` / `5c4ca26b0db5571114be58393e17854a771f7790`
- Repository: `https://github.com/pmndrs/jotai.git`
- Source root: `src`
- Test root: `tests`
- License: MIT
- npm archive SHA-256: `52c820bc338cbbcc1b58c7758c9603b61ca9fc17526adecd84045a15e91c0157`
- Supported upstream range: exactly `2.20.2`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`

The npm archive contains the compiled package, declarations, and license, but
not the complete repository test history. The tagged runtime and type suites
have not been vendored and adapted one-for-one, so the parity manifest remains
`recorded-unverified`.

## Export crosswalk

| Upstream entry point or export | Octane disposition | Evidence or gap |
| --- | --- | --- |
| `atom` (`jotai`, `/vanilla`) | Reused unchanged | Re-exported from `jotai/vanilla`; binding and utility conformance suites exercise atom behavior. |
| `createStore` (`jotai`, `/vanilla`) | Reused unchanged | Re-exported from `jotai/vanilla`; provider and store conformance suites exercise explicit stores. |
| `getDefaultStore` (`jotai`, `/vanilla`) | Reused unchanged | Re-exported from `jotai/vanilla`; default-store conformance cases exercise it. |
| `INTERNAL_overrideCreateStore` (`jotai`, `/vanilla`) | Reused unchanged | Re-exported from the pinned vanilla package; no Octane-specific adaptation. |
| `RESET` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported from the pinned vanilla utilities; reset utility conformance covers its public behavior. |
| `atomFamily` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported; utility conformance covers family reuse and removal. |
| `atomWithDefault` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported; utility conformance covers default restoration. |
| `atomWithLazy` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported from the pinned framework-neutral implementation. |
| `atomWithObservable` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported; local utility conformance covers observable subscription behavior. |
| `atomWithReducer` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported; local utility conformance covers reducer updates. |
| `atomWithRefresh` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported from the pinned framework-neutral implementation. |
| `atomWithReset` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported; reset utility conformance covers it. |
| `atomWithStorage` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported; local utility conformance covers storage-backed atoms. |
| `createJSONStorage` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported from the pinned framework-neutral implementation. |
| `freezeAtom` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported from the pinned framework-neutral implementation. |
| `freezeAtomCreator` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported from the pinned framework-neutral implementation. |
| `loadable` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported; async conformance exercises loadable atom state. |
| `selectAtom` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported; local utility conformance covers derived selection. |
| `splitAtom` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported; the bounded list differential covers add, toggle, remove, and stable keys. |
| `unstable_withStorageValidator` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported from the pinned framework-neutral implementation. |
| `unwrap` (`/vanilla/utils`, `/utils`) | Reused unchanged | Re-exported from the pinned framework-neutral implementation. |
| `INTERNAL_addPendingPromiseToDependency` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_buildStoreRev3` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_getBuildingBlocksRev3` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_getMountedOrPendingDependents` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_hasInitialValue` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_initializeStoreHooksRev3` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_isActuallyWritableAtom` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_isAtomStateInitialized` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_isPromiseLike` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_returnAtomValue` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `INTERNAL_shouldThrowSynchronously` (`/vanilla/internals`) | Reused unchanged | Exact re-export from the pinned internals module. |
| `Provider` | Ported | Provider scope and nested-shadowing behavior is covered by conformance tests and the bounded differential. |
| `useStore` | Ported | Store-resolution and provider-swap conformance cases cover default, provider, and explicit stores. |
| `useAtom` | Ported | Conformance and differential cases cover primitive, derived, writable, scoped, list, and async atoms. |
| `useAtomValue` | Ported | Conformance and differential cases cover subscriptions, derived values, and async resolution. |
| `useSetAtom` | Ported | Conformance verifies writes without writer re-renders; the counter differential covers setter behavior. |
| `useResetAtom` (`/react/utils`, `/utils`) | Ported | `tests/conformance/utils.test.ts`. |
| `useReducerAtom` (`/react/utils`, `/utils`) | Ported | `tests/conformance/utils.test.ts`. |
| `useAtomCallback` (`/react/utils`, `/utils`) | Ported | `tests/conformance/utils.test.ts`. |
| `useHydrateAtoms` (`/react/utils`, `/utils`) | Ported | `tests/conformance/utils.test.ts`; no dedicated server/hydration differential exists. |
| `jotai` | Published entry point | Export-surface conformance compares every runtime export with upstream. |
| `jotai/vanilla` | Published entry point | Exact framework-neutral re-export; export-surface conformance checks it. |
| `jotai/vanilla/utils` | Published entry point | Exact framework-neutral re-export; export-surface conformance checks it. |
| `jotai/vanilla/internals` | Published entry point | Exact framework-neutral re-export under the matching Octane subpath. |
| `jotai/react` | Published entry point | Ported React-facing exports; export-surface conformance checks it. |
| `jotai/react/utils` | Published entry point | Ported React-facing utilities; export-surface conformance checks it. |
| `jotai/utils` | Published entry point | Combined vanilla and React utility surface; export-surface conformance checks it. |
| `jotai/babel/*` | Excluded non-runtime scope | React-specific build-time plugins are not part of the Octane runtime binding contract. |
| `jotai/package.json` | Not published | Package metadata is not part of the Octane runtime binding contract. |

## Upstream suite disposition

| Pinned artifact | Current disposition | Reason or local evidence |
| --- | --- | --- |
| `tests/babel/plugin-debug-label.test.ts` | Out of scope | Babel plugins are an intentional non-runtime divergence. |
| `tests/babel/plugin-react-refresh.test.ts` | Out of scope | Babel plugins are an intentional non-runtime divergence. |
| `tests/babel/preset.test.ts` | Out of scope | Babel plugins are an intentional non-runtime divergence. |
| `tests/react/abortable.test.tsx` | Not adapted | Upstream suite remains unvendored; async behavior has bounded local conformance only. |
| `tests/react/async.test.tsx` | Not adapted | Async atoms have bounded conformance and differential evidence, not one-for-one adaptation. |
| `tests/react/async2.test.tsx` | Not adapted | Async atoms have bounded conformance and differential evidence, not one-for-one adaptation. |
| `tests/react/basic.test.tsx` | Not adapted | Core binding behavior has local conformance and differential evidence. |
| `tests/react/dependency.test.tsx` | Not adapted | Dependency behavior has local conformance coverage only. |
| `tests/react/error.test.tsx` | Not adapted | Error behavior is not represented by an adapted upstream lane. |
| `tests/react/items.test.tsx` | Not adapted | List behavior has bounded `splitAtom` evidence only. |
| `tests/react/onmount.test.tsx` | Not adapted | Mount behavior is not represented by an adapted upstream lane. |
| `tests/react/optimization.test.tsx` | Not adapted | Bailout and subscription behavior has local conformance coverage only. |
| `tests/react/provider.test.tsx` | Not adapted | Provider behavior has bounded conformance and differential evidence. |
| `tests/react/transition.test.tsx` | Not adapted | React transition mechanics are not represented by an adapted upstream lane. |
| `tests/react/types.test.tsx` | Not adapted | Upstream type suite is present but unvendored and unadapted. |
| `tests/react/useAtomValue.test.tsx` | Not adapted | `useAtomValue` has bounded local runtime evidence. |
| `tests/react/useSetAtom.test.tsx` | Not adapted | `useSetAtom` has bounded local runtime evidence. |
| `tests/react/utils/types.test.tsx` | Not adapted | Upstream utility type suite is present but unadapted. |
| `tests/react/utils/useAtomCallback.test.tsx` | Not adapted | Local utility conformance covers representative behavior. |
| `tests/react/utils/useHydrateAtoms.test.tsx` | Not adapted | Local utility conformance exists; no hydration differential is registered. |
| `tests/react/utils/useReducerAtom.test.tsx` | Not adapted | Local utility conformance covers representative behavior. |
| `tests/react/utils/useResetAtom.test.tsx` | Not adapted | Local utility conformance covers representative behavior. |
| `tests/react/vanilla-utils/atomFamily.test.tsx` | Not adapted | Framework-neutral implementation is reused; React integration suite remains unadapted. |
| `tests/react/vanilla-utils/atomWithDefault.test.tsx` | Not adapted | Framework-neutral implementation is reused; React integration suite remains unadapted. |
| `tests/react/vanilla-utils/atomWithObservable.test.tsx` | Not adapted | Framework-neutral implementation is reused; React integration suite remains unadapted. |
| `tests/react/vanilla-utils/atomWithReducer.test.tsx` | Not adapted | Framework-neutral implementation is reused; React integration suite remains unadapted. |
| `tests/react/vanilla-utils/atomWithRefresh.test.tsx` | Not adapted | Framework-neutral implementation is reused; React integration suite remains unadapted. |
| `tests/react/vanilla-utils/atomWithStorage.test.tsx` | Not adapted | Framework-neutral implementation is reused; React integration suite remains unadapted. |
| `tests/react/vanilla-utils/freezeAtom.test.tsx` | Not adapted | Framework-neutral implementation is reused; React integration suite remains unadapted. |
| `tests/react/vanilla-utils/loadable.test.tsx` | Not adapted | Framework-neutral implementation is reused; React integration suite remains unadapted. |
| `tests/react/vanilla-utils/selectAtom.test.tsx` | Not adapted | Framework-neutral implementation is reused; React integration suite remains unadapted. |
| `tests/react/vanilla-utils/splitAtom.test.tsx` | Not adapted | Bounded `splitAtom` differential exists; upstream file remains unadapted. |
| `tests/setup.ts` | Support only | Upstream runner setup is not an executable test artifact. |
| `tests/test-utils.ts` | Support only | Upstream test helper is not an executable test artifact. |
| `tests/vanilla/basic.test.tsx` | Not adapted | Pinned vanilla runtime is reused directly; upstream suite is not claimed as executed. |
| `tests/vanilla/dependency.test.tsx` | Not adapted | Pinned vanilla runtime is reused directly; upstream suite is not claimed as executed. |
| `tests/vanilla/derive.test.tsx` | Not adapted | Pinned vanilla runtime is reused directly; upstream suite is not claimed as executed. |
| `tests/vanilla/effect.test.ts` | Not adapted | Pinned vanilla runtime is reused directly; upstream suite is not claimed as executed. |
| `tests/vanilla/internals.test.tsx` | Not adapted | Pinned vanilla internals are reused directly; upstream suite is not claimed as executed. |
| `tests/vanilla/memoryleaks.test.ts` | Not adapted | Pinned vanilla runtime is reused directly; upstream suite is not claimed as executed. |
| `tests/vanilla/store.test.tsx` | Not adapted | Pinned vanilla store is reused; local store conformance is bounded evidence only. |
| `tests/vanilla/storedev.test.tsx` | Not adapted | Pinned vanilla runtime is reused directly; upstream suite is not claimed as executed. |
| `tests/vanilla/types.test.tsx` | Not adapted | Upstream vanilla type suite is present but unadapted. |
| `tests/vanilla/utils/atomFamily.test.ts` | Not adapted | Pinned vanilla utility is reused; upstream suite is not claimed as executed. |
| `tests/vanilla/utils/atomWithDefault.test.ts` | Not adapted | Pinned vanilla utility is reused; upstream suite is not claimed as executed. |
| `tests/vanilla/utils/atomWithLazy.test.ts` | Not adapted | Pinned vanilla utility is reused; upstream suite is not claimed as executed. |
| `tests/vanilla/utils/atomWithRefresh.test.ts` | Not adapted | Pinned vanilla utility is reused; upstream suite is not claimed as executed. |
| `tests/vanilla/utils/atomWithReset.test.ts` | Not adapted | Pinned vanilla utility is reused; upstream suite is not claimed as executed. |
| `tests/vanilla/utils/loadable.test.ts` | Not adapted | Pinned vanilla utility is reused; upstream suite is not claimed as executed. |
| `tests/vanilla/utils/types.test.tsx` | Not adapted | Upstream vanilla utility type suite is present but unadapted. |
| `tests/vanilla/utils/unwrap.test.ts` | Not adapted | Pinned vanilla utility is reused; upstream suite is not claimed as executed. |

## Bounded evidence

The `jotai-runtime-differential` lane compiles four `.tsrx` fixtures for both
runtimes. It compares primitive and derived atoms, write-only setters, default
and nested provider scopes, `splitAtom` keyed-list changes, and async pending to
resolved output after identical interactions. These declared cases are
enforced by the shared harness; they do not establish exhaustive upstream-suite
parity.
