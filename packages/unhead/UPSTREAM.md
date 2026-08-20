# Upstream crosswalk

## Pin

- React package: `@unhead/react@3.3.2`
- Canonical repository: <https://github.com/unjs/unhead>
- Annotated tag: `v3.3.2`
- Peeled commit: `ea4d6e207cbe50694e8ee53df08b1440a3a27c8c`
- npm integrity: `sha512-O9EHChUlP6Wk2VRwQCPxQvcwsqIJNYgdWwdS2aeH5LsJoZaoOC+awPnP5amn1jUHVuf5/FvfxesEPlw/MkiTow==`
- npm shasum: `d11c769c98120ddfc5af145e36ee2da3c907661b`
- Advertised compatibility: `@unhead/react@3.3.2`
- Reused core: `unhead@3.3.2`
- License: MIT, copyright Harlan Wilton

The published tarball supplies the built package. The canonical repository at the
commit above supplies the TypeScript source, tests, and MIT license. Those files
are vendored byte-for-byte under [`upstream/`](./upstream/) and are excluded from
the published package by the manifest's explicit `files` list.

## Export crosswalk

| Upstream export | Entry | Octane disposition | Evidence |
| --- | --- | --- | --- |
| `hookImports` | `.` | Ported; package name is `@octanejs/unhead` | [`src/autoImports.ts`](./src/autoImports.ts) |
| `Head` / `HeadProps` | `.` | Ported; children must be `createElement` host tags | [`tests/head.test.ts`](./tests/head.test.ts) |
| `useUnhead` | `.` | Ported with Octane `useContext` | [`tests/use-head.test.ts`](./tests/use-head.test.ts) |
| `useHead` | `.` | Ported with Octane manual slot forwarding | [`tests/use-head.test.ts`](./tests/use-head.test.ts) |
| `useHeadSafe` | `.` | Ported over the unchanged core | [`src/composables.ts`](./src/composables.ts) |
| `useSeoMeta` | `.` | Ported with Octane manual slot forwarding | [`tests/use-seo-meta.test.ts`](./tests/use-seo-meta.test.ts) |
| `useScript` | `.` | Ported over the unchanged core | [`src/composables.ts`](./src/composables.ts) |
| `defineLink` / `defineScript` | `.` | Reused verbatim from `unhead` | [`src/index.ts`](./src/index.ts) |
| `createHead` | `./client` | Ported; same debounced DOM renderer as upstream | [`tests/use-head.test.ts`](./tests/use-head.test.ts) |
| `UnheadProvider` | `./client` | Ported; `head` and `value` props, rejects both | [`tests/use-head.test.ts`](./tests/use-head.test.ts) |
| `renderDOMHead` | `./client` | Reused verbatim from `unhead/client` | [`src/client.ts`](./src/client.ts) |
| `UnheadProvider` | `./server` | Ported; required `value` | [`src/server.ts`](./src/server.ts) |
| `createHead` / `renderSSRHead` / `prepareTemplate` / `transformHtmlTemplate` | `./server` | Reused verbatim from `unhead/server` | [`tests/use-head.test.ts`](./tests/use-head.test.ts) |
| `Helmet` | `./helmet` | Ported; same children contract as `Head` | [`src/helmet.ts`](./src/helmet.ts) |
| `*` | `./utils` | Reused verbatim from `unhead/utils` | [`src/utils.ts`](./src/utils.ts) |
| `Unhead` bundler factory | `./bundler` | Explicit gap — compiler/bundler plugin, not runtime | — |
| `Unhead` Vite plugin | `./vite` | Explicit gap — Vite plugin, not runtime | — |
| streaming Vite plugin | `./stream/vite` | Explicit gap — compiler plugin | — |
| `*` | `./plugins` | Explicit gap — compiler/bundler plugin surface | — |
| `createStreamableHead` / `HeadStream` / `wrap` | `./stream/server` | Explicit gap — React `renderToPipeableStream` | — |
| `createStreamableHead` / `HeadStream` | `./stream/client` | Explicit gap — React streaming hydration helper | — |

## Test disposition

| Upstream file | Disposition |
| --- | --- |
| `test/useHead.test.tsx` | Ported key cases in [`tests/use-head.test.ts`](./tests/use-head.test.ts) |
| `test/SimpleHead.test.tsx` | Ported key cases in [`tests/head.test.ts`](./tests/head.test.ts) using `createElement` children |
| `test/fixtures/SimpleHead.tsx` | Adapted in [`tests/_fixtures/simple-head.ts`](./tests/_fixtures/simple-head.ts) |
| `test/unmount-cleanup.test.tsx` | Ported key cases (title restore / entry dispose) in [`tests/unmount-cleanup.test.ts`](./tests/unmount-cleanup.test.ts) |
| `test/useSeoMeta.test.tsx` | Ported key cases in [`tests/use-seo-meta.test.ts`](./tests/use-seo-meta.test.ts) |
| `test/helmet.test.tsx` | Not adapted this pass; Helmet is ported, children use the same `createElement` contract |
| `test/useScript.test.tsx` | Not adapted this pass; `useScript` is ported |
| `test/ssr-useHead.test.tsx` | Not adapted this pass |
| `test/SimpleHeadSSR.test.tsx` | Not adapted this pass |
| `test/HeadRawContent.test.tsx` | Not adapted this pass |
| `test/HeadRawContentSSR.test.tsx` | Not adapted this pass |
| `test/ReactiveTitle.test.tsx` | Not adapted this pass |
| `test/debug-strict.test.tsx` | Out of scope — React 18 StrictMode double-invoke |
| `test/streaming.test.tsx` | Out of scope — React streaming / `renderToPipeableStream` |
| `test/e2e-streaming.test.ts` | Out of scope — React streaming |
| `test/vite-plugin.test.ts` | Out of scope — Vite compiler plugin |
| `test/unified-plugin.test.ts` | Out of scope — bundler plugin |
| `test/public-types.test.ts` | Out of scope — upstream type-package assertions |

## Intentional divergences

- `Head` / `Helmet` children must be `createElement` host tags. TSRX block children
  (`<Head><title>…</title></Head>`) are compiler children-blocks and cannot be
  flattened into Unhead input.
- Octane hooks carry compiler slots internally; this is invisible to consumers
  and required for stable composition outside `.tsrx` modules.
- `./stream/*`, `./bundler`, `./vite`, and `./plugins` are not runtime Octane
  APIs.
