# Upstream provenance

`@octanejs/lingui` is pinned to `@lingui/react@6.6.0`.

- package: `@lingui/react@6.6.0`
- repository: https://github.com/lingui/js-lingui
- tag: `v6.6.0`
- tag commit: `665a19815378dedd89346bb7707bdb0e28df79e7`
- advertised range: `6.6.x`
- license: MIT
- npm integrity: `sha512-oRZvm8nx47wQB7Y4tQ4K78Ba0Ta0wJLRpT7125zW3J1wq++hMfc9XMqemCau2IDVtCMHGHdlLPiBeyFSIq/0Rw==`
- npm shasum: `4f7ff7dcaf584dc46a6dc92acbd49116fbc6c722`
- reused core: `@lingui/core@6.6.0` (dependency)

## Source boundary

- `upstream/canonical/` is the canonical tagged `packages/react` source (runtime, tests, macro, RSC entries, LICENSE).
- The Octane package depends on `@lingui/core@6.6.0` and reimplements only the React binding. Macro compile-time plugins and RSC `React.cache` entries are explicit gaps.

Vendored evidence is development-only and excluded from package `files`.

## Export crosswalk

The pinned package publishes `.`, `./server`, and `./macro`.

| Upstream export | Octane status | Evidence / divergence |
| --- | --- | --- |
| `I18nProvider` | Ported | `src/I18nProvider.tsrx`; `tests/I18nProvider.test.ts` |
| `useLingui` | Ported; subscribes through octane `useSyncExternalStore` (not `use-sync-external-store`) | `tests/I18nProvider.test.ts` |
| `LinguiContext` | Ported | `src/I18nProvider.tsrx` |
| `I18nProviderProps` / `I18nContext` | Ported; `children` is `OctaneNode` | `src/I18nProvider.tsrx` |
| `Trans` | Ported | `src/Trans.tsrx`; `tests/Trans.test.ts` |
| `TransNoContext` | Ported (module + re-export) | `src/TransNoContext.tsrx`; `tests/Trans.test.ts` |
| `TransProps` / `TransRenderProps` / `TransRenderCallbackOrComponent` | Ported; renderables are `OctaneNode` | `src/TransNoContext.tsrx` |
| `formatElements` | Ported (internal) | `src/format.ts`; `tests/format.test.ts` |
| `./macro` and `@lingui/babel-plugin-lingui-macro` | Gap | Compile-time macros; not a runtime Octane surface |
| `./server` `setI18n` / `getI18n` | Gap | `React.cache` / RSC request store |
| react-server `index-rsc` / `TransRsc` | Gap | RSC entry that depends on `./server` |

## Upstream test disposition

| Upstream artifact | Disposition |
| --- | --- |
| `canonical/src/I18nProvider.test.tsx` | Adapted in `tests/I18nProvider.test.ts` (case names kept) |
| `canonical/src/Trans.test.tsx` | Adapted in `tests/Trans.test.ts` (case names kept; class-component render rewritten as a function component) |
| `canonical/src/format.test.tsx` | Adapted in `tests/format.test.ts` (case names kept) |
| `canonical/macro/index.test.ts` | Out of scope: compile-time macro; recorded as a gap |
| `canonical/macro/__typetests__/index.tst.tsx` | Out of scope with `./macro` |

## Intentional divergences

- Public node and component types use `OctaneNode` and do not import React.
- Locale subscription uses octane `useSyncExternalStore` rather than `use-sync-external-store/shim`.
- `Trans` `component` class components are not supported; pass a function component.
- `./macro`, `./server`, and the react-server RSC entry are not published.
