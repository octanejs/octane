# Upstream crosswalk

## Pin

- React package: `react-alien-signals@0.3.0`
- Canonical repository: <https://github.com/Rajaniraiyn/react-alien-signals>
- Immutable commit: `6d883959ddf25a3f486451ff8abff60eb989671c`
- Advertised compatibility: `react-alien-signals@0.3.0`
- Reused core: `alien-signals@1.0.4` (the upstream peer range is `~1.0.4`)
- React oracle suite: the pinned repository's `src/index.test.ts`, authored for React 18+
- Pristine oracle environment (intentional workspace pin, enforced at run time by
  [`audit/pristine-oracle-environment.json`](./audit/pristine-oracle-environment.json)):
  - `react@19.2.7` / `react-dom@19.2.7`
  - `@testing-library/react@16.3.2`
  - `@happy-dom/global-registrator@20.11.2`
  - `@testing-library/jest-dom@6.9.1`
- Upstream `package.json` at the pin declares looser ranges (`react-dom@^19.0.0`,
  `@testing-library/react@^16.2.0`, `@happy-dom/global-registrator@^17.1.3`). The pristine lane does
  **not** silently inherit whatever happens to sit in `node_modules`; it records and verifies the
  workspace-selected oracle versions above before executing the suite.

The published tarball supplies the built single-entry package. The canonical repository at the
commit above supplies the TypeScript source, test suite, and MIT license. Those files are vendored
byte-for-byte under [`upstream/`](./upstream/) and are excluded from the published package by the
manifest's explicit `files` list.

Run `pnpm --dir packages/alien-signals upstream:verify` to reject removed or modified pinned
evidence. The checksum ledger covers the source, complete upstream test file, and license.

Parity ownership, inventories, and lane registration live in
[`audit/react-parity.json`](./audit/react-parity.json).

## Export crosswalk

The pinned package has one public entry point, `react-alien-signals`.

| Upstream export | Octane disposition | Evidence |
| --- | --- | --- |
| `WritableSignal` | Ported | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`public-api.test-d.ts`](./typetests/public-api.test-d.ts) |
| `createSignal` | Ported over the unchanged core; the wrapper makes the advertised functional setter contract real | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `createComputed` | Ported over the unchanged core | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `createEffect` | Ported over the unchanged core | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `createSignalScope` | Ported over the unchanged core | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| `useSignal` | Ported with Octane manual slot forwarding | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), `packages/octane/tests/external-hook-slot.test.ts` |
| `useSignalValue` | Ported; accepts readable computed signals as the upstream docs and runtime intend | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`public-api.test-d.ts`](./typetests/public-api.test-d.ts) |
| `useSetSignal` | Ported with stable identity and signal replacement | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`octane-contracts.test.ts`](./tests/octane-contracts.test.ts) |
| `useSignalEffect` | Ported with post-commit ownership and deterministic cleanup | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`render-safety.test.ts`](./tests/ssr/render-safety.test.ts) |
| `useSignalScope` | Ported with a cancellation-safe controller and post-commit ownership | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts), [`octane-contracts.test.ts`](./tests/octane-contracts.test.ts) |
| `useComputed` | Ported; the caller's dependency list is passed directly to memoization | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |

`ReadableSignal` and `DependencyList` are explicit Octane type exports. They describe public call
shapes that the upstream implementation documents but does not name as exports.

## Type suite

Upstream ships an executable typecheck: `package.json` defines `typecheck: tsc --noEmit`, and the
pinned `tsconfig.json` typechecks `src/index.ts` plus `src/index.test.ts` (including the
`@ts-expect-error` at `src/index.test.ts:392`). Those artifacts are vendored under
[`upstream/`](./upstream/) and run byte-exact in the `alien-signals-pristine-types` lane.
`typetests/upstream-typecheck.test-d.ts` keeps the matching adapted assertion group and the full
accepted public-API call inventory from that suite; supplemental public-api probes remain under
`audit/type-probes/` and `typetests/`.

## Test disposition

The pinned repository contains one runtime test file, `src/index.test.ts`. It is vendored unchanged
at [`upstream/src/index.test.ts`](./upstream/src/index.test.ts) and executes byte-exact in the
`alien-signals-pristine` lane via bun. Each adapted case keeps the upstream title and cites
`// Per src/index.test.ts:<line>` in [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts).

| Upstream case | Line | Octane evidence |
| --- | --- | --- |
| should create a writable signal | 31 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should create and update a computed signal | 39 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should create and run an effect | 56 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should create a signal scope | 70 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignal should return [value, setter] | 87 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignalValue should return read-only value from a signal | 97 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSetSignal should return setter only | 106 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignalEffect should register an effect in React | 122 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignalScope should create and manage an effect scope in React | 135 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should return a computed value | 141 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle nested signal updates correctly | 155 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle signal updates within effects | 169 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should properly cleanup effects when scope is stopped | 185 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignal should handle functional updates correctly | 214 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should update when dependencies change | 226 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should not enter a render loop after a dependency update | 247 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should reuse the computed across re-renders when deps are unchanged | 271 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useComputed should rebuild the computed when deps change | 296 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| useSignalEffect should handle cleanup correctly | 318 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle signal updates correctly | 341 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle multiple signal updates | 359 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle undefined/null signal values | 385 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle computed dependencies correctly | 401 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should cleanup all subscriptions on unmount | 422 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle multiple mount/unmount cycles | 449 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) |
| should handle concurrent updates correctly | 477 | [`upstream-adapted.test.ts`](./tests/upstream-adapted.test.ts) (same `Promise.all` + microtask setters; final value) |

Octane-only framework contracts stay outside parity ownership: SSR render safety in
[`render-safety.test.ts`](./tests/ssr/render-safety.test.ts), hydration adoption in
[`hydration.test.ts`](./tests/hydration.test.ts), cancellation/identity contracts in
[`octane-contracts.test.ts`](./tests/octane-contracts.test.ts), manual slot isolation in
`packages/octane/tests/external-hook-slot.test.ts`, and central playground registration in
`playground/octane/src/demos/AlienSignals.test.ts`.

## Intentional divergences

- Effects and scopes begin after the client commit. React's adapter also uses `useEffect`, but the
  Octane port additionally guarantees that a stop controller called before commit remains stopped.
- `useSignalValue` accepts any readable signal rather than repeating the upstream declaration's
  writable-only narrowing (`alien-signals-readable-computed`; paired probes stay on writable
  `count`, with Octane-only coverage in `typetests/readable-computed.test-d.ts`).
- Octane hooks carry compiler slots internally; this is invisible to consumers and required for
  stable composition outside `.tsrx` modules.