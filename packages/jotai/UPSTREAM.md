# Jotai upstream

`@octanejs/jotai` ports the provider and React hooks from Jotai 3.0.0 and imports the framework-neutral core from `jotai/vanilla`, `/vanilla/utils`, and `/vanilla/internals`.

## Immutable identity and license

- Release: `jotai@3.0.0`
- Commit: `89d4fddd1949628e50952fc8ac1b09786248dfca`
- Source: https://github.com/pmndrs/jotai/tree/89d4fddd1949628e50952fc8ac1b09786248dfca
- MIT license: exact upstream bytes in packaged `LICENSE.upstream`; SHA-256 `0530d5d58026f4bb73367d195946f6a516a648ea62dd8b84763318f64d3cb3e2`.
- npm integrity: `sha512-KxhbmsJUp/tmrv6aZgO+nzB3H9K8C0xmk5i3aGkwy/EANg73DVBkggv3zVHaAi5PlNlQgTgP4uiVepo+JC+wSA==`.
- npm archive SHA-256: `dc9cfb4c901424eea4be448048a274c56472ab0956ee4e4e7d1623bc98e4ef00`.
- Signed npm provenance resolves the release tag to this commit; npm does not publish a `gitHead` for this release.
- Tested dependency: 3.0.0; supported catalog range: `^3.0.0`.
- React runtime oracle: React and React DOM 19.2.7. Original type compiler: TypeScript 6.0.3, with React types 19.2.18 and React DOM types 19.2.7.

`audit/upstream.lock.json` authenticates the byte-exact repository source and tests under `upstream/`. The npm artifact is retained for published-declaration verification. Neither tree is published. Vanilla source appears only in the pristine test environment; runtime code imports the installed upstream dependency.

## Complete export crosswalk

The table includes runtime and type exports from every published runtime entry. Root and vanilla utilities import the same upstream implementation. Provider/hooks and the four hook utilities are adapted to Octane. All seven entries have exact runtime export-set checks and positive public type assertions in `tests/types/public.ts`, including upstream's unstable `INTERNAL_*` exports. Package metadata describes the Octane package itself.

| Entry | Exports | Disposition |
| --- | --- | --- |
| `@octanejs/jotai` | `Atom`, `ExtractAtomArgs`, `ExtractAtomResult`, `ExtractAtomValue`, `Getter`, `INTERNAL_overrideCreateStore`, `PrimitiveAtom`, `Provider`, `SetStateAction`, `Setter`, `WritableAtom`, `atom`, `createStore`, `getDefaultStore`, `useAtom`, `useAtomValue`, `useAtomValueRaw`, `useAtomValueRawSync`, `useSetAtom`, `useStore` | Imported vanilla exports plus ported hooks/provider. |
| `@octanejs/jotai/utils` | `RESET`, `atomWithDefault`, `atomWithLazy`, `atomWithObservable`, `atomWithReducer`, `atomWithRefresh`, `atomWithReset`, `atomWithStorage`, `createJSONStorage`, `freezeAtom`, `freezeAtomCreator`, `selectAtom`, `splitAtom`, `unstable_withStorageValidator`, `unwrap`, `useAtomCallback`, `useHydrateAtoms`, `useReducerAtom`, `useResetAtom` | Imported vanilla exports plus ported hooks/provider. |
| `@octanejs/jotai/vanilla` | `Atom`, `ExtractAtomArgs`, `ExtractAtomResult`, `ExtractAtomValue`, `Getter`, `INTERNAL_overrideCreateStore`, `PrimitiveAtom`, `SetStateAction`, `Setter`, `WritableAtom`, `atom`, `createStore`, `getDefaultStore` | Imported from the matching Jotai vanilla entry. |
| `@octanejs/jotai/vanilla/utils` | `RESET`, `atomWithDefault`, `atomWithLazy`, `atomWithObservable`, `atomWithReducer`, `atomWithRefresh`, `atomWithReset`, `atomWithStorage`, `createJSONStorage`, `freezeAtom`, `freezeAtomCreator`, `selectAtom`, `splitAtom`, `unstable_withStorageValidator`, `unwrap` | Imported from the matching Jotai vanilla entry. |
| `@octanejs/jotai/vanilla/internals` | `INTERNAL_AtomOnInit`, `INTERNAL_AtomOnMount`, `INTERNAL_AtomRead`, `INTERNAL_AtomState`, `INTERNAL_AtomStateMap`, `INTERNAL_AtomWrite`, `INTERNAL_BuildingBlocks`, `INTERNAL_Callbacks`, `INTERNAL_ChangedAtoms`, `INTERNAL_EnsureAtomState`, `INTERNAL_FlushCallbacks`, `INTERNAL_InvalidateDependents`, `INTERNAL_InvalidatedAtoms`, `INTERNAL_KEY_abortHandlersMap`, `INTERNAL_KEY_abortPromise`, `INTERNAL_KEY_atomOnInit`, `INTERNAL_KEY_atomOnMount`, `INTERNAL_KEY_atomRead`, `INTERNAL_KEY_atomStateMap`, `INTERNAL_KEY_atomWrite`, `INTERNAL_KEY_changedAtoms`, `INTERNAL_KEY_enhanceBuildingBlocks`, `INTERNAL_KEY_ensureAtomState`, `INTERNAL_KEY_flushCallbacks`, `INTERNAL_KEY_invalidateDependents`, `INTERNAL_KEY_invalidatedAtoms`, `INTERNAL_KEY_mountAtom`, `INTERNAL_KEY_mountCallbacks`, `INTERNAL_KEY_mountDependencies`, `INTERNAL_KEY_mountedMap`, `INTERNAL_KEY_readAtomState`, `INTERNAL_KEY_recomputeInvalidatedAtoms`, `INTERNAL_KEY_registerAbortHandler`, `INTERNAL_KEY_setAtomStateValueOrPromise`, `INTERNAL_KEY_storeEpochHolder`, `INTERNAL_KEY_storeGet`, `INTERNAL_KEY_storeHooks`, `INTERNAL_KEY_storeSet`, `INTERNAL_KEY_storeSub`, `INTERNAL_KEY_unmountAtom`, `INTERNAL_KEY_unmountCallbacks`, `INTERNAL_KEY_writeAtomState`, `INTERNAL_MountAtom`, `INTERNAL_MountDependencies`, `INTERNAL_Mounted`, `INTERNAL_MountedMap`, `INTERNAL_ReadAtomState`, `INTERNAL_RecomputeInvalidatedAtoms`, `INTERNAL_Store`, `INTERNAL_StoreHooks`, `INTERNAL_UnmountAtom`, `INTERNAL_WriteAtomState`, `INTERNAL_addPendingPromiseToDependency`, `INTERNAL_buildStoreRev4`, `INTERNAL_getBuildingBlocksRev4`, `INTERNAL_getMountedOrPendingDependents`, `INTERNAL_hasInitialValue`, `INTERNAL_initializeStoreHooksRev4`, `INTERNAL_isActuallyWritableAtom`, `INTERNAL_isAtomStateInitialized`, `INTERNAL_isPromiseLike`, `INTERNAL_returnAtomValue`, `INTERNAL_shouldThrowSynchronously` | Imported from the matching Jotai vanilla entry. |
| `@octanejs/jotai/react` | `Provider`, `useAtom`, `useAtomValue`, `useAtomValueRaw`, `useAtomValueRawSync`, `useSetAtom`, `useStore` | Ported hooks/provider. |
| `@octanejs/jotai/react/utils` | `useAtomCallback`, `useHydrateAtoms`, `useReducerAtom`, `useResetAtom` | Ported hooks/provider. |

## Source boundary

`src/react/Provider.tsrx` and `src/react/store.ts` correspond to upstream `src/react/Provider.ts`. `src/react/utils.ts` retains the four modules under upstream `src/react/utils/`. Other hook and continuable-promise modules preserve upstream layout. `src/internal.ts` supplies the Octane call-site slot adaptation. `audit/source-ledger.json` records hashes for the complete shipped closure and identifies the adapted boundary.

Octane's `use()` handles Suspense; React 18's fallback is unnecessary. Raw hook subscriptions and the Rev4 abort-handler protocol follow Jotai 3. Provider context is deduplicated by renderer identity, retaining the existing Octane binding contract. Providers render one stable JSX shape when the store prop changes.

The migration removes `delay`, `loadable`, `atomFamily`, the atom-read `setSelf` option, and Rev3 internals, as upstream did. The existing `INTERNAL_InferAtomTuples` utility export is retained for compatibility and checked against Jotai's published `dist/react/utils/useHydrateAtoms.d.ts` declaration. See README for consumer guidance.

## Complete upstream test crosswalk

`audit/registrations.json` preserves all 404 immutable registrations across 44 test files. `audit/crosswalk.json` maps each registration to its generated Octane test file. Both pristine and adapted runtime suites execute all 404 registrations without skips. Eleven registrations in the four explicit type-test files are additionally compiled in separate pristine and adapted programs; the hydration utility suite's negative type controls are also compiled.

The committed lock generates ignored `tests/upstream/`. Import repointing and the Octane JSX pragma are mechanical rewrites. Committed patches contain only these test adaptations:

- React class error boundaries become functional Octane error boundaries, preserving the error, fallback and retry assertions.
- Commit-count hooks move from JSX child expressions into component setup so they observe the owning component. Their effects use explicit `null` dependencies for the original every-render observation.
- The observable error-boundary fixture moves to module scope for Octane compilation.

The pristine type lane preserves upstream's `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. The adapted lane uses the repository's strict configuration without these additional flags because imported Octane runtime source does not satisfy them. Both lanes retain `strict: true`, `skipLibCheck: false`, every upstream positive assertion, and every negative control.

`audit/react-parity.json` registers pristine/adapted runtime and type lanes, the four existing React/Octane differential scenarios, and the SSR/hydration conformance scenario. The latter proves no server subscriptions, existing DOM adoption, click/external-store updates, and teardown. Conformance checks additionally cover slot identity, provider scope/swap, subscription cleanup, async rejection/resolution and utilities.

## Reproduce evidence

```sh
node scripts/react-port/materialize.mjs run --package-dir packages/jotai
node scripts/react-parity/verify-provenance.mjs --package-dir packages/jotai
pnpm --dir packages/jotai test
node scripts/react-parity/harness.mjs run-required --manifest packages/jotai/audit/react-parity.json
./packages/jotai/node_modules/.bin/tsc --noEmit -p packages/jotai/tsconfig.pristine.json
pnpm exec tsrx-tsc --noEmit -p packages/jotai/tsconfig.adapted.json
pnpm exec tsrx-tsc --noEmit -p packages/jotai/tsconfig.json
pnpm exec tsrx-tsc --noEmit -p packages/jotai/tests/types/tsconfig.json
pnpm packages:pack:check
```

The shared port evidence gate records the actual commands and verifies the package contract, licenses, crosswalk, and shipped closure. The declared imported surfaces retain dependency, exports, public types and consumer checks; copied React surfaces retain their full upstream suite obligations. The ownership declaration does not remove prior evidence.
