# Upstream

## Pin and oracle boundary

| Field | Value |
| --- | --- |
| Repository | https://github.com/statelyai/xstate |
| Release tag | `@xstate/react@6.1.0` |
| Commit | `d4f8c5b709291d44f70139a7f9ff333abd7c615c` |
| Supported upstream range | exactly `@xstate/react@6.1.0` |
| Source root | `packages/xstate-react/src` |
| Test root | `packages/xstate-react/test` |
| Actor-core peer | `xstate@^5.28.0` (oracle `xstate@5.32.5`) |
| React oracle | `react@19.2.3`, `react-dom@19.2.3`, `@types/react@19.2.17` |
| License | MIT |

The vendored tree under [`upstream/`](./upstream) is byte-exact at that commit and
carries upstream's `LICENSE`. It is prettier-ignored and excluded from the
published `files`, so it is development evidence rather than shipped code.
[`upstream/SHA256SUMS`](./upstream/SHA256SUMS) pins every vendored byte;
`pnpm --dir packages/xstate upstream:verify` re-hashes the tree and fails on any
drift or on an added/removed file.

## Source boundary

`xstate` itself is **not** ported and **not** vendored. It has no React import
and no runtime dependencies, so the actor core, machine interpreter, and every
`xstate` export are consumed unmodified from npm as a peer dependency. Only the
React binding in `packages/xstate-react/src` is ported, module for module, and
`src/` mirrors that layout so the two trees read side by side.

Two of upstream's npm dependencies are React-specific and are replaced by
in-repo ports rather than consumed:

| Upstream dependency | Replacement | Why |
| --- | --- | --- |
| `use-sync-external-store/shim/with-selector` | [`src/useSyncExternalStoreWithSelector.ts`](./src/useSyncExternalStoreWithSelector.ts) | React's shim closes over React's concurrent-render model. The port keeps the exact memoization algorithm on Octane's native `useSyncExternalStore`. |
| `use-isomorphic-layout-effect` | [`src/useIsomorphicLayoutEffect.ts`](./src/useIsomorphicLayoutEffect.ts) | The package is a bare hook alias. Octane hooks take a trailing compiler-assigned slot, so the helper has to be a function that forwards one. The DOM probe is unchanged. |
| `#is-development` (package `imports` condition) | [`src/isDevelopment.ts`](./src/isDevelopment.ts) | Upstream publishes a prebuilt `dist/` and resolves the condition at build time. This package publishes raw `src/`, so the equivalent is the `NODE_ENV` probe every bundler constant-folds. |

React and `@xstate/react` are development-only differential oracles; neither is a
runtime dependency of the port.

## Module crosswalk

| Upstream module | Octane module | Disposition |
| --- | --- | --- |
| `src/index.ts` | [`src/index.ts`](./src/index.ts) | Ported; same six exports, same deprecation comment |
| `src/useActor.ts` | [`src/useActor.ts`](./src/useActor.ts) | Ported; plain uSES shim replaced by Octane's native hook |
| `src/useActorRef.ts` | [`src/useActorRef.ts`](./src/useActorRef.ts) | Ported; `useIdleActorRef` takes a positional internal signature (see below) |
| `src/useMachine.ts` | [`src/useMachine.ts`](./src/useMachine.ts) | Ported; deprecated alias retained |
| `src/useSelector.ts` | [`src/useSelector.ts`](./src/useSelector.ts) | Ported |
| `src/createActorContext.ts` | [`src/createActorContext.ts`](./src/createActorContext.ts) | Ported. Stays plain `.ts`: the hooks it returns must forward their CALLER's compiler-assigned slot, and a compiled `.tsrx` appends its own symbol after any forwarded one, which would collapse every consumer call site onto a single hook cell. |
| — | [`src/ActorProvider.tsrx`](./src/ActorProvider.tsrx) + [`.tsrx.d.ts`](./src/ActorProvider.tsrx.d.ts) | Octane-only split of the above: the provider is a component, so it lives in a compiled `.tsrx` and owns its hooks instead of forwarding them. Replaces upstream's `React.createElement(ReactContext.Provider, …)`. |
| `src/shallowEqual.ts` | [`src/shallowEqual.ts`](./src/shallowEqual.ts) | Reused verbatim — pure comparator, no framework surface |
| `src/stopRootWithRehydration.ts` | [`src/stopRootWithRehydration.ts`](./src/stopRootWithRehydration.ts) | Reused verbatim — touches xstate internals only |
| `src/true.ts`, `src/false.ts` | [`src/isDevelopment.ts`](./src/isDevelopment.ts) | Dependency substitution; see the table above |
| — | [`src/internal.ts`](./src/internal.ts) | Octane-only: `splitSlot`/`subSlot` hook-slot plumbing |

## Export crosswalk

Every export of the pinned upstream entry point `@xstate/react`:

| Upstream export | Octane disposition | Evidence |
| --- | --- | --- |
| `useActor` | Ported | Types: `xstate-adapted-types`. Runtime: `xstate-adapted-upstream`, 26 upstream cases |
| `useActorRef` | Ported | Types: `xstate-adapted-types`. Runtime: `xstate-adapted-upstream`, 18 upstream cases |
| `useSelector` | Ported | Types: `xstate-adapted-types`. Runtime: `xstate-adapted-upstream`, 18 upstream cases |
| `useMachine` | Ported (deprecated alias of `useActor`, as upstream) | Types: `xstate-adapted-types`. Runtime: `xstate-adapted-upstream` (upstream exercises it through the `useActor` suite) and `xstate-runtime-differential` |
| `createActorContext` | Ported | Runtime: `xstate-adapted-upstream`, 13 upstream cases, plus `xstate-runtime-differential`. Not covered by the upstream type suite. |
| `shallowEqual` | Reused verbatim | Runtime: exercised by the `xstate-adapted-upstream` `useSelector` cases. Not covered by the upstream type suite. |
| `useIdleActorRef` (module-level, not exported from `index.ts`) | Ported with a positional `(logic, options, slot)` signature instead of upstream's `ConditionalRequired` variadic tuple. Unreachable for consumers: the package `exports` map exposes only the barrel, and upstream's `index.ts` does not re-export it either. | [`src/useActorRef.ts`](./src/useActorRef.ts) |

## Sibling xstate packages

The community request covered "xstate", so the rest of the org's React-facing
surface is accounted for here rather than silently omitted:

| Package | Disposition |
| --- | --- |
| `xstate` | Framework-neutral. Reused unmodified as a peer dependency; no binding needed. |
| `@xstate/store`, `@xstate/store-react` | Ported separately as [`@octanejs/xstate-store`](../xstate-store). |
| `@xstate/immer` | Framework-neutral (one module, no React import). Consume directly alongside this binding; no Octane binding needed. |
| Stately inspection tooling (`@statelyai/inspect`) | Framework-neutral and published from a different repository. Consume directly; not applicable to this port. |
| `@xstate/solid`, `@xstate/svelte`, `@xstate/vue`, `@xstate/store-{angular,preact,solid,svelte,vue}` | Not React bindings. Out of scope. |

## React-parity lanes

| Lane | Status |
| --- | --- |
| `xstate-pristine` | **Landed.** Runs the byte-exact `test/*.test.tsx` suite against `@xstate/react@6.1.0` and `react@19.2.3` after re-hashing every vendored byte, in upstream's own `happy-dom` environment with `globals: true`. 144 of 144 cases pass; the passing identities are pinned in [`audit/pristine-runtime.json`](./audit/pristine-runtime.json). |
| `xstate-adapted-upstream` | **Landed.** Runs the one-for-one adapted `useActor`, `useActorRef`, `useSelector`, and `createActorContext` suites on Octane: 75 cases whose full names match the pristine lane's identities exactly. Inventory: [`audit/adapted-runtime.json`](./audit/adapted-runtime.json); permitted transformations are listed in the lane's `notes` in [`audit/react-parity.json`](./audit/react-parity.json). |
| `xstate-pristine-types` | **Landed.** Compiles the vendored `test/types.test.tsx` together with the vendored `src` using plain `tsc` against `react@19.2.3` / `@types/react@19.2.17`, reproducing upstream's `allowImportingTsExtensions`. Config: [`audit/upstream-typetests/tsconfig.pristine.json`](./audit/upstream-typetests/tsconfig.pristine.json). |
| `xstate-adapted-types` | **Landed.** Compiles [`typetests/types.test-d.tsx`](./typetests/types.test-d.tsx) with `tsrx-tsc`. The file is byte-identical to the vendored upstream suite below its header apart from one line (`@testing-library/react` → `@octanejs/testing-library`), and that is machine-checked rather than asserted: `react-parity:check` strips the header, undoes the transformation ledger in [`audit/type-parity.json`](./audit/type-parity.json), and requires the result to equal the vendored bytes. Any other edit — a deleted case, a softened type, a dropped `@ts-expect-error` — fails. |
| `xstate-runtime-differential` | **Landed.** Runs one `.tsrx` fixture through this binding on Octane AND the real `@xstate/react@6.1.0` on `react@19.2.3`, asserting byte-identical `innerHTML` after every click. Covers `useMachine` transitions, `createActorContext` provider + selectors + `assign`, a final-state transition, a post-final no-op send, and an unbound `useSelector` over a context actor. `xstate@5.32.5` is shared by both sides and deliberately not rewritten, so any difference is attributable to the binding. |

## Type suite evidence

Both type suites are inventoried at file and assertion-group granularity in
[`audit/pristine-types.json`](./audit/pristine-types.json) and
[`audit/adapted-types.json`](./audit/adapted-types.json): 14 assertion groups
each, of which 3 are `@ts-expect-error` negative assertions. The inventories are
regenerated with `node scripts/react-parity/xstate-types-inventory.mjs` and a
stale one fails the audit, so an inventory cannot stand in for a suite it no
longer describes.

The suites are compiled, never executed, so a compiler exit code alone is weak
evidence: a gutted suite also compiles clean. Negative controls in
[`scripts/react-parity/xstate-parity-controls.test.mjs`](../../scripts/react-parity/xstate-parity-controls.test.mjs)
delete an assertion, drop a `@ts-expect-error`, empty the file, retarget an
undeclared import, and stale the inventory, and require each to be rejected.

## Runtime suite disposition

Both columns are evidence today: the pristine lane runs the vendored suite
unchanged against React, and the adapted lane runs the same cases on Octane.

| Upstream artifact | Cases | Pristine | Adapted |
| --- | --- | --- | --- |
| `test/useActor.test.tsx` | 26 × 2 modes | Runs unchanged, 52 passing | One-for-one, non-strict mode only |
| `test/useActorRef.test.tsx` | 18 × 2 modes | Runs unchanged, 36 passing | One-for-one, non-strict mode only |
| `test/useSelector.test.tsx` | 18 × 2 modes | Runs unchanged, 36 passing | One-for-one, non-strict mode only |
| `test/createActorContext.test.tsx` | 13 | Runs unchanged, 13 passing | One-for-one |
| `test/types.test.tsx` | 7 | Runs unchanged, 7 passing | Pristine and adapted type lanes |
| `test/utils.tsx` | — | Support only | `describeEachReactMode` parametrizes three files over `non-strict` and `strict`; the adapted helper runs the single applicable mode and the strict pass is not applicable (Octane has no StrictMode double-invoke). |
| `package.json` | — | Support only: its `imports` map is what resolves `#is-development` for the vendored source, so the pristine runner reproduces that field verbatim in the run root. | Replaced by [`src/isDevelopment.ts`](./src/isDevelopment.ts). |
| `vitest.config.mts` | — | Support only; [`tests/upstream-vitest.config.ts`](./tests/upstream-vitest.config.ts) reuses its `happy-dom` environment and `globals` setting. | Not applicable. |

## Intentional divergences

Every row is declared in [`audit/react-parity.json`](./audit/react-parity.json)
with the case ids that pin it, and each is bound to a structured
`OCTANE DIVERGENCE[id][caseId]` marker at the code it describes.

| Divergence | Consumer impact | Pinned by |
| --- | --- | --- |
| No StrictMode double-invoke, so upstream's eight `suiteKey === 'strict'` render/effect/observer counts collapse to their non-strict values | Fewer renders and effect invocations in development than React StrictMode; production counts are identical | The eight adapted cases themselves (`xstate-no-strictmode-double-invoke`) |
| `useSyncExternalStore` skips React's commit-time `getSnapshot` re-read when the rendered value was unchanged | Only observable for a store that mutates without notifying between render and commit; xstate always notifies | [`tests/conformance/divergences.test.ts`](./tests/conformance/divergences.test.ts), with a notifying control proving the reconciliation path is live at that exact point |
| Server `getServerSnapshot` is optional and falls back to `getSnapshot` where React throws | Only reachable through a hand-rolled actor-like object; both ported hooks always supply one. Two layers contribute: Octane's server runtime defaults the argument, and [`src/useSyncExternalStoreWithSelector.ts`](./src/useSyncExternalStoreWithSelector.ts) passes `getServerSelection ?? getSelection` where upstream's replaced shim forwards it unchanged. | [`tests/ssr/server.test.ts`](./tests/ssr/server.test.ts), with a control proving the fallback is a real fallback. React throws the same error on the client while hydrating; this package has no hydration lane, so that half is untested here and belongs in `packages/octane/tests/hydration/`. |
| Error boundaries are `@try`/`@catch` template blocks, not class components | Upstream's error tests use a class `ErrorBoundary`; the adapted fixtures use `@try`/`@catch`. The assertion — a thrown actor error reaching the nearest boundary — is unchanged. | The two adapted error-boundary cases (`xstate-error-boundary-try-catch`) |
