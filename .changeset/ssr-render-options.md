---
"octane": patch
"@octanejs/vite-plugin": patch
---

SSR: the buffered renderers (`renderToString`/`renderToStaticMarkup` in
`octane/server`, `prerender` in `octane/static`) gain a `RenderOptions` argument:
`nonce` (CSP nonce stamped on the emitted inline `<style>` tags and the suspense seed
script — all renderers), plus `signal` (AbortSignal that rejects a suspended render
when the request dies) and `timeoutMs` (per-render override of the suspense settle
deadline) on the async `prerender`. `octane/server` now documents which exports are
the compiler's private ABI and exports the `executeServerFunction` RPC executor the
vite plugin's dev RPC handler loads via `ssrLoadModule('octane/server')` (previously a
missing export, so any `module server` call crashed). Wire format is devalue, matching
`@ripple-ts/adapter`'s client stub: devalue-encoded argument array in, devalue-encoded
`{ value }` envelope out. See the new `docs/ssr.md` for the full SSR guide and the
current gaps (streaming, selective hydration, production server build).
