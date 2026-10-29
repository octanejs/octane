# Upstream boundary

- Package: `use-sync-external-store@1.7.0`.
- Source: https://github.com/react/react/tree/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/use-sync-external-store
- Immutable commit: `1d34f91dfde6bba84d08b683aaba164c7194dacb`.
- License: MIT. `LICENSE.upstream` retains the exact Meta notice and permission.
- npm integrity: `sha512-6L+EeigHMQhdaIPNIFUKwfWJSwWFQ8gJbJ2DLOs5sDIegTwR9fRxvnM3uciHKjIZhFz+KAv2emhWMRvDmMcY8A==`.

`audit/upstream.lock.json` pins every pristine source and test blob under
`upstream/`. `upstream-artifact/` holds the integrity-checked npm tarball and its
extracted files, the pristine runtime oracle. Neither ships.

## Source boundary

| Upstream | Binding | Disposition |
| --- | --- | --- |
| `src/useSyncExternalStoreWithSelector.js` | `src/useSyncExternalStoreWithSelector.ts` | Ported onto Octane's hooks with a trailing hook slot. |
| `src/useSyncExternalStore.js`, `index.js` | `src/index.ts` | Re-exports Octane's built-in hook and keeps the development warning. |
| `src/useSyncExternalStoreShim.js`, `shim/index.js`, `shim/index.native.js` | `src/shim/index.ts` | On React 18+ the shim selects the built-in hook; Octane always has it. |
| `with-selector.js`, `shim/with-selector.js` | `src/useSyncExternalStoreWithSelector.ts` | Both builds share one module, since both resolve to the built-in hook. |
| `src/useSyncExternalStoreShimClient.js`, `src/useSyncExternalStoreShimServer.js`, `src/isServerEnvironment.js`, `src/forks/*` | none | The userspace fallback for React 16 and 17, and the build forks selecting it, are inapplicable. |

The complete published surface is accounted for: `useSyncExternalStore` from the
main entry and every `/shim` spelling, and `useSyncExternalStoreWithSelector` from
every `with-selector` spelling. The `react-native` condition of `/shim` resolves to
the same module as `default`.

## Test evidence

The pinned package ships no TypeScript declarations or type tests; the public
types follow `@types/use-sync-external-store` and are checked by
`tests/types/public.test-d.ts`.

The three pinned runtime test files register 22 cases. The pristine lane runs
their bytes unchanged against React 19.2.7 and the npm artifact; the adapted lane
runs them, regenerated with the lock's import rewrites and the patches in
`audit/upstream-patches/`, against Octane. `tests/harness.ts` stands in for the
parts of React's Jest environment they use. In both lanes the build-test
configuration gates one legacy-root case to the React 17 shim variant. Every
`OCTANE DIVERGENCE` in the patches is listed in `audit/react-parity.json`, and
`audit/crosswalk.json` maps every registration to its evidence.
