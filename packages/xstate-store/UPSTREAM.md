# Upstream

## Pin and oracle boundary

| Field | Value |
| --- | --- |
| Repository | https://github.com/statelyai/xstate |
| Release tag | `@xstate/store-react@2.0.0` |
| Commit | `ddca0ff8c53dc2e85f9173514cc686308d65bd2c` |
| Supported upstream range | exactly `@xstate/store-react@2.0.0` |
| Source root | `packages/xstate-store-react/src` |
| Test root | `packages/xstate-store-react/src` (upstream colocates its tests with the source) |
| Store core | `@xstate/store@4.2.3` (a direct dependency, as upstream) |
| React oracle | `react@19.2.3`, `react-dom@19.2.3`, `@types/react@19.2.17` |
| License | MIT |

The vendored tree under [`upstream/`](./upstream) is byte-exact at that commit.
`@xstate/store-react` ships no `LICENSE` of its own, so
[`upstream/LICENSE`](./upstream/LICENSE) is the sibling `@xstate/store` MIT
notice from the same commit. The tree is prettier-ignored and excluded from the
published `files`. [`upstream/SHA256SUMS`](./upstream/SHA256SUMS) pins every
vendored byte; `pnpm --dir packages/xstate-store upstream:verify` re-hashes the
tree and fails on any drift.

## Source boundary

`@xstate/store` is **not** ported and **not** vendored. It is framework-neutral,
and upstream's binding re-exports it wholesale (`export * from '@xstate/store'`),
so it is consumed unmodified from npm as a direct dependency and re-exported the
same way. Only the React binding module is ported.

Upstream has no React-specific runtime dependencies to replace: it builds
directly on `useCallback`, `useRef`, and `useSyncExternalStore`, all of which are
first-class Octane hooks.

## Module crosswalk

| Upstream module | Octane module | Disposition |
| --- | --- | --- |
| `src/index.ts` | [`src/index.ts`](./src/index.ts) | Ported |
| — | [`src/internal.ts`](./src/internal.ts) | Octane-only: `splitSlot`/`subSlot` hook-slot plumbing |

## Export crosswalk

| Upstream export | Octane disposition | Evidence |
| --- | --- | --- |
| `export * from '@xstate/store'` | Re-exported unchanged | Types: `xstate-store-adapted-types`. Runtime: `xstate-store-adapted-upstream` |
| `useSelector` (both overloads) | Ported | Types: `xstate-store-adapted-types`. Runtime: `xstate-store-adapted-upstream` |
| `useStore` | Ported | Types: `xstate-store-adapted-types`. Runtime: `xstate-store-adapted-upstream` |
| `useAtom` (all three overloads) | Ported | Types: `xstate-store-adapted-types`. Runtime: `xstate-store-adapted-upstream` |
| `useAtomState` | Ported | Types: `xstate-store-adapted-types`. Runtime: `xstate-store-adapted-upstream` |
| `createStoreHook` | Ported | Types: `xstate-store-adapted-types`. Runtime: `xstate-store-adapted-upstream` |

Module-private helpers (`defaultCompare`, `identity`, `useSelectorWithCompare`,
`createStoreFromDefinition`, `isAtom`) are ported alongside their callers and are
not part of the published surface, matching upstream.

## React-parity lanes

| Lane | Status |
| --- | --- |
| `xstate-store-pristine` | **Landed.** Runs the byte-exact `src/**/*.test.{ts,tsx}` suite against `@xstate/store-react@2.0.0` and `react@19.2.3` after re-hashing every vendored byte, in upstream's own `happy-dom` environment with its `development`/`browser` resolve conditions. 19 of 19 cases pass; the passing identities are pinned in [`audit/pristine-runtime.json`](./audit/pristine-runtime.json). |
| `xstate-store-adapted-upstream` | **Landed.** Runs the one-for-one adapted `src/index.test.tsx` suite on Octane: all 14 cases, names and assertions preserved, so the identity set equals the pristine lane's. Inventory: [`audit/adapted-runtime.json`](./audit/adapted-runtime.json); permitted transformations are listed in the lane's `notes` in [`audit/react-parity.json`](./audit/react-parity.json). |
| `xstate-store-pristine-types` | **Landed.** Compiles the vendored `src/types.test.tsx` together with the vendored `src/index.ts` using plain `tsc`. Config: [`audit/upstream-typetests/tsconfig.pristine.json`](./audit/upstream-typetests/tsconfig.pristine.json). |
| `xstate-store-adapted-types` | **Landed.** Compiles [`typetests/types.test-d.tsx`](./typetests/types.test-d.tsx) with `tsrx-tsc`. The file is byte-identical to the vendored upstream suite below its header apart from one line (the import root), and that is machine-checked rather than asserted: `react-parity:check` strips the header, undoes the transformation ledger in [`audit/type-parity.json`](./audit/type-parity.json), and requires the result to equal the vendored bytes. All thirteen `@ts-expect-error` markers are preserved, and dropping one fails the audit. |
| `xstate-store-runtime-differential` | **Out of scope for this port.** The four schema-required lanes above are landed and the adapted suite already reruns every upstream case on Octane. A differential lane would add a second oracle for the same 14 scenarios; `@octanejs/xstate` carries one because `createActorContext` has provider and selector interactions with no upstream runtime coverage, which this package's surface does not. |

## Type suite evidence

Both type suites are inventoried at file and assertion-group granularity in
[`audit/pristine-types.json`](./audit/pristine-types.json) and
[`audit/adapted-types.json`](./audit/adapted-types.json): 19 assertion groups
each, of which 13 are `@ts-expect-error` negative assertions. The inventories
are regenerated with `node scripts/react-parity/xstate-types-inventory.mjs` and
a stale one fails the audit.

## Runtime suite disposition

Both columns are evidence today: the pristine lane runs the vendored suite
unchanged against React, and the adapted lane runs the same cases on Octane.

| Upstream artifact | Cases | Pristine | Adapted |
| --- | --- | --- | --- |
| `src/index.test.tsx` | 14 | Runs unchanged, 14 passing | One-for-one |
| `src/types.test.tsx` | 5 | Runs unchanged, 5 passing | Pristine and adapted type lanes |
| `vitest.config.mts` | — | Support only; [`tests/upstream-vitest.config.ts`](./tests/upstream-vitest.config.ts) reuses its environment, `globals`, and resolve conditions. | Not applicable. |
| `tsconfig.json`, `package.json`, `README.md` | — | Support only | Not applicable |

Unlike `@xstate/react`, this suite is not parametrized over React StrictMode, so
every case has a single applicable mode.

## Intentional divergences

Only the first row is attributable to this binding, so it is the only entry in
[`audit/react-parity.json`](./audit/react-parity.json). The other two are Octane
runtime behaviors this package cannot reach, recorded here for completeness with
a pointer to where they are pinned.

| Divergence | Consumer impact | Pinned by |
| --- | --- | --- |
| Upstream calls hooks inside `if` branches in `useSelector` and `useAtom`. React tolerates this only because the branch is stable per call site; Octane keys hooks by call site, so it is simply legal here. | If a call site does flip between the selector and no-selector branch, React corrupts hook order while Octane keeps independent hook cells per branch and unsubscribes the abandoned one. Octane is strictly better-behaved; no supported usage reaches it. | [`tests/conformance/binding.test.ts`](./tests/conformance/binding.test.ts) (`xstate-store-call-site-hook-slots`) |
| `useSyncExternalStore` skips React's commit-time `getSnapshot` re-read when the rendered value was unchanged | Only observable for a store that mutates without notifying between render and commit, which no store reachable through these hooks does | Octane runtime behavior, not this binding's. Pinned in [`@octanejs/xstate`](../xstate/tests/conformance/divergences.test.ts) rather than duplicated here. |
| Server `getServerSnapshot` is optional and falls back to `getSnapshot` where React throws | Unreachable here: every `useSyncExternalStore` call in `src/index.ts` passes an explicit third argument, so the fallback is never taken. | Octane runtime behavior, not this binding's. Pinned in [`@octanejs/xstate`](../xstate/tests/ssr/server.test.ts) rather than duplicated here. |
