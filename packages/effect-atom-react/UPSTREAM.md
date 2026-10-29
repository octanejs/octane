# @effect/atom-react upstream ledger

`@octanejs/effect-atom-react` targets `@effect/atom-react@4.1.0` from
`https://github.com/Effect-TS/effect.git`, package directory `packages/atom/react/`.

## Immutable pin

- Package: `@effect/atom-react@4.1.0` (latest on npm)
- Tag: `@effect/atom-react@4.1.0`
- Commit: `9a91b1926a5fbfaffd302a7a41a94d4d53a1154e`
- npm archive SHA-256: `045118ccc6a1d0e11c97879bfc8dfdd6a84c80becb871a2e4d2ea7aa96156210`
- npm lock integrity: `sha512-PeaBDmwqG9BPQfaPHeWCB2NF4NQaFlI6poKxjlBHMrMjKqV+LVBdryhpDNqSZOhqGgT+qnh9gV+19MYjNOQ+bg==`
- License: MIT. The package's `LICENSE` is retained byte-exact as `LICENSE.upstream`
  and the repository root's as `LICENSE.upstream-root`.

npm publishes no `gitHead` for this release. Its signed SLSA provenance
attestation names the commit, and `pnpm react-port:preflight --npm-provenance`
verified it; the release tag points at the same commit. The tarball's `src/`
files have the commit's git blob hashes except `Hooks.ts`, where the published
copy repeats one JSDoc block on both `useAtomValue` overloads. The code is the
same.

`audit/upstream.lock.json` pins the package directory at that commit by git blob
hash, scoped to `LICENSE`, `README.md`, `package.json`, `src/`, `test/`,
`tsconfig.json` and `vitest.setup.ts` (the 228 KB `CHANGELOG.md` is left out), and
`pnpm react-port:materialize run --check --package-dir packages/effect-atom-react`
verifies the committed `upstream/` tree offline. The npm tarball is kept in
`upstream-artifact/`, hash-pinned by `audit/provenance.json`.

## Source boundary

- Adapted from upstream: the five modules under `upstream/src/`, ported one for
  one into `src/` (below). Nothing else of upstream ships.
- Reused, not copied: `effect` (atoms, registries, `AsyncResult`, hydration).
- Re-authored without copying: the one `scheduler` behavior upstream uses.
- Development only, outside the published `files`: the pinned `upstream/` tree,
  the npm tarball in `upstream-artifact/`, `audit/`, `scripts/`, `tests/` and
  `typetests/`.

## Source crosswalk

| Upstream | Port | Adaptation |
| --- | --- | --- |
| `src/Hooks.ts` | `src/Hooks.tsrx` | Hooks from `octane`. Upstream's every-render `useEffect(flushDeferred)` passes `null`, because Octane infers an omitted dependency array. Generic arrows carry a trailing comma for TSX parsing. Every explicit dependency array is upstream's. |
| `src/RegistryContext.ts` | `src/RegistryContext.tsrx` | `scheduleTask` posts a host task instead of a React Scheduler task. The provider renders `<RegistryContext value>`. |
| `src/ReactHydration.ts` | `src/ReactHydration.tsrx` | Hooks from `octane`; `OctaneNode` children. |
| `src/ScopedAtom.ts` | `src/ScopedAtom.tsrx` | `<Context value>`; Octane's `FC`, `Context` and `OctaneNode` types. |
| `src/index.ts` | `src/index.ts` | Same re-exports. |

The `"use client"` directives are dropped: Octane has no Server Components.

## Export crosswalk

Every module is published at the root and at its own subpath, as upstream's
`./*` export does.

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| `useAtomValue`, `useAtomSuspense`, `RegistryContext`, `RegistryProvider`, `HydrationBoundary`, `make` (`ScopedAtom`) | Ported | Upstream cases, pristine and adapted; SSR and hydration cases |
| `useAtomRef` | Ported | Upstream case; differential `useAtomRefProp` case |
| `useAtom`, `useAtomSet`, `useAtomMount`, `useAtomRefresh`, `useAtomSubscribe`, `useAtomInitialValues`, `useAtomRefProp`, `useAtomRefPropValue` | Ported | Differential cases (upstream has none) |
| `scheduleTask` | Ported, divergent | `tests/scheduleTask.test.ts` |
| `TypeId`, `ScopedAtom`, `HydrationBoundaryProps` | Ported | `typetests/public-api.test-d.ts` |

## Dependencies

- `effect` is the framework-neutral core (atoms, registries, `AsyncResult`,
  hydration) and is a peer dependency at upstream's `^4.1.0`.
- `scheduler`, upstream's React Scheduler peer, is not used. `scheduleTask`
  re-authors the behavior the package relies on: a cancellable task that runs
  after the current task and its microtasks, in order. Each task posts its own
  `MessageChannel` message (`setTimeout` where there is none), the unclamped host
  task React Scheduler uses.

## Behavioral oracle

- **Pristine lane** (`effect-atom-react-pristine`): the pinned
  `test/index.test.tsx` runs unchanged against the pinned source on React 19.2.7,
  all 28 registrations. `@effect/vitest` is aliased to `vitest`: the suite uses only
  its `assert`, which re-exports Vitest's, and 4.1.0 requires Vitest 5.
- **Adapted lane** (`effect-atom-react-adapted`): the same file, regenerated from
  the lock with import rewrites (`react` and `react-dom/client` to `octane`,
  testing libraries and `react-error-boundary` to their Octane bindings,
  `RegistryContext.Provider` to `RegistryContext`), runs against Octane. One patch
  changes the four SSR cases: their server half renders server-compiled twins of
  the same components (`tests/_fixtures/server.tsx`), and their `innerHTML`
  comparisons drop comments, because Octane's hydration comments are not React's.
  Every value, recoverable-error and hydration assertion is upstream's.
- **Differential lane** (`effect-atom-react-differential`): drives the pinned React
  source and the port through the same steps for the hooks and provider behavior
  upstream does not test, and compares rendered text, returned setters and
  promises, Suspense fallbacks, and registry lifecycle after each.
- **Upstream types**: upstream has no type tests; its `check` script typechecks
  `src/`. `typetests/tsconfig.pristine.json` does the same with `tsc` and React's
  types, and `typetests/tsconfig.adapted.json` typechecks the port's `src/` with
  `tsrx-tsc`. `typetests/public-api.test-d.ts` pins the public types.

`scripts/update-audit.mjs` regenerates the committed inventories, crosswalk,
closure, and `audit/react-parity.json`.

## Updating

Move the lock to the new release with `pnpm react-port:materialize lock`, commit
the refreshed `upstream/` tree, port the source diff, regenerate the adapted suite,
and rerun `node packages/effect-atom-react/scripts/update-audit.mjs`.
