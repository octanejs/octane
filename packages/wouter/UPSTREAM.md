# Upstream crosswalk

## Pin and source boundary

- Package: `wouter@3.10.0`
- Advertised compatibility: `wouter@3.10.x`
- Canonical repository: <https://github.com/molefrog/wouter>
- Immutable tag commit: `708c23639d4174ba7deda06c40c8208118899da7`
- npm integrity:
  `sha512-zTfddD80zc2/J5l8JKcdvzOK6AwP0kpyHEI3DxRN2bn8U1oJPnrSVm8v+X3WwDamvLAOxTO7ZvkxkpRWlyeJ1Q==`
- npm `gitHead`: `708c23639d4174ba7deda06c40c8208118899da7`
- License: Unlicense

The immutable repository checkout supplies the canonical source, declarations,
and tests under [`upstream/canonical`](./upstream/canonical). Its
`packages/wouter/package.json` still reports `3.9.0` at the tag commit. The npm
tarball under [`upstream/npm`](./upstream/npm) reports `3.10.0`; this port pins
the published `3.10.0` package and records the repository metadata mismatch
rather than rewriting either artifact. The runtime modules are byte-equivalent
at the two source boundaries.

Vendored evidence is excluded from the published package. `src/` mirrors the
canonical runtime module layout, with TypeScript declarations integrated into
the authored modules and `internal.ts`, `location-hook.ts`, and `router.ts`
providing Octane slot and public type support.

## Export crosswalk

| Upstream entry/export | Octane disposition | Evidence |
| --- | --- | --- |
| `wouter`: `Router` | Ported | `tests/components.test.ts` |
| `wouter`: `Route` | Ported | `tests/components.test.ts` |
| `wouter`: `Link` | Ported; `ref` is a prop instead of `forwardRef` | `tests/components.test.ts` |
| `wouter`: `Switch` | Ported; explicit descriptors are inspectable, nested TSRX children are opaque | `tests/components.test.ts` |
| `wouter`: `Redirect` | Ported | `tests/components.test.ts` |
| `wouter`: `useRouter` | Ported | `tests/components.test.ts` |
| `wouter`: `useParams` | Ported | `tests/components.test.ts` |
| `wouter`: `useLocation` | Ported with trailing hook-slot forwarding | `tests/components.test.ts`, `tests/use-route.test.ts` |
| `wouter`: `useSearch` | Ported with trailing hook-slot forwarding | `tests/location-hooks.test.ts` |
| `wouter`: `useSearchParams` | Ported with isolated `useMemo`/`useEvent` slots | `tests/components.test.ts` |
| `wouter`: `useRoute` | Ported | `tests/use-route.test.ts` |
| `wouter`: `matchRoute` | Ported with the upstream algorithm | `tests/use-route.test.ts` |
| `wouter`: public route, match, navigation, router, and search-param types | Ported to `OctaneNode`, native `MouseEvent`, Octane descriptors, and refs-as-props | package typecheck |
| `wouter/use-browser-location`: `useLocationProperty` | Ported onto Octane `useSyncExternalStore` | `tests/location-hooks.test.ts` |
| `wouter/use-browser-location`: `useSearch` | Ported | `tests/location-hooks.test.ts` |
| `wouter/use-browser-location`: `usePathname` | Ported | `tests/location-hooks.test.ts` |
| `wouter/use-browser-location`: `useHistoryState` | Ported | `tests/location-hooks.test.ts` |
| `wouter/use-browser-location`: `navigate` | Ported | `tests/location-hooks.test.ts` |
| `wouter/use-browser-location`: `useBrowserLocation` | Ported with optional trailing slot | `tests/location-hooks.test.ts` |
| `wouter/use-hash-location`: `navigate` | Ported | `tests/location-hooks.test.ts` |
| `wouter/use-hash-location`: `useHashLocation` | Ported with optional trailing slot and `hrefs` formatter | `tests/location-hooks.test.ts` |
| `wouter/memory-location`: `memoryLocation` | Ported, including search, state, recording, and reset | `tests/memory-location.test.ts` |
| `src/paths.js` | Reused algorithm unchanged as `src/paths.ts` | route/location suites |
| `src/use-sync-external-store.js` | Replaced by Octane's built-in `useSyncExternalStore`; no shim dependency | location suites |
| `src/use-sync-external-store.native.js` | GAP: Octane has no React Native shim entry | Not exported |
| Wouter's Preact package | GAP: a separate Preact binding is outside `@octanejs/wouter` | Not published |

## Upstream test disposition

Every adapted case retains its upstream title and cites its source file. No
adapted test is skipped or marked todo.

| Canonical test artifact | Disposition |
| --- | --- |
| `test/memory-location.test.ts` | Fully adapted in `tests/memory-location.test.ts` |
| `test/use-route.test.tsx` | Fully adapted in `tests/use-route.test.ts` |
| `test/link.test.tsx` | Adapted core link/ref/navigation/asChild cases in `tests/components.test.ts`; active-link rerender variants remain out of scope for this first pass |
| `test/route.test.tsx` | Fully adapted in `tests/components.test.ts` |
| `test/redirect.test.tsx` | Fully adapted in `tests/components.test.ts` |
| `test/view-transitions.test.tsx` | Fully adapted in `tests/components.test.ts` |
| `test/use-browser-location.test.tsx` | Adapted in `tests/location-hooks.test.ts`; asynchronous `history.back()` remains a jsdom gap |
| `test/use-hash-location.test.tsx` | Adapted synchronous browser cases in `tests/location-hooks.test.ts`; server, `data:` URL, and asynchronous listener-order cases remain environment lanes |
| `test/use-search.test.tsx` | Fully adapted in `tests/location-hooks.test.ts` |
| `test/use-search-params.test.tsx` | Adapted browser read/write/empty-query cases in `tests/components.test.ts`; custom-router and Unicode variants are already covered by the `useSearch` suite |
| `test/parser.test.tsx` | Adapted with a custom parser in `tests/components.test.ts`; the upstream `path-to-regexp` oracle is not a runtime dependency |
| `test/router.test.tsx` | Adapted construction, identity, base, and SSR-option cases in `tests/components.test.ts`; remaining nested inheritance variants are not yet adapted |
| `test/switch.test.tsx` | Adapted descriptor, fallback, array, and Fragment cases in `tests/components.test.ts`; async consistency cases are not yet adapted |
| `test/use-params.test.tsx` | Adapted default and closest-route cases in `tests/components.test.ts`; nested/reactive cases are not yet adapted |
| `test/use-location.test.tsx` | Covered by browser, hash, memory, base-path, and navigation tests across the adapted suites; the upstream parameterized file is not duplicated |
| `test/nested-route.test.tsx` | Adapted in `tests/nested-route.test.ts` |
| `test/ssr.test.tsx` | Adapted in `tests/ssr.test.ts` using `octane/server` `renderToStaticMarkup` |
| `test/history-patch.test.ts` | Browser patch behavior is exercised through `useBrowserLocation`; the duplicate React/Preact export assertion is not applicable |
| `test/setup.ts` | Adapted to Vitest/jsdom in `tests/setup.ts` |
| `test/test-utils.ts` | Not needed by the synchronous jsdom adaptation |
| `test/jest-dom.d.ts` | Not applicable; adapted assertions use DOM properties directly |
| `test/*.test-d.ts`, `test/*.test-d.tsx` | A focused accepted/rejected API slice is adapted in `tests/public-types.test-d.ts`; a one-for-one upstream type oracle remains a first-pass gap |

## Intentional Octane differences and gaps

- Runtime source imports only from `octane`; React and
  `use-sync-external-store` are not dependencies.
- `Link` receives `ref` as a normal prop. Octane has no `forwardRef`.
- `useLocationFromRouter` forwards the compiler's trailing symbol into dynamic
  `router.hook(router, slot)` calls. Browser, hash, and memory hooks accept
  `(options, slot?)`, and also treat a symbol in the first position as the slot.
  `useEvent` independently sub-slots its ref and insertion effect.
- `Switch` can inspect explicit `createElement` descriptors and descriptor
  arrays. Nested TSRX children are opaque render blocks, so consumers assembling
  a switch dynamically must pass `children={[...]}` or explicit descriptors.
- The native `use-sync-external-store.native.js` entry and Wouter's separate
  Preact package have no Octane equivalents.
