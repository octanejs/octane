---
"octane": patch
"@octanejs/vite-plugin": patch
---

SSR: the server entry point is now `renderToString(component, props?, options?)`;
`render` remains as a deprecated alias. New `RenderOptions`: `signal` (AbortSignal that
rejects the render when the request dies), `nonce` (CSP nonce stamped on the emitted
inline `<style>` tags and the suspense seed script), and `timeoutMs` (per-render
override of the suspense settle deadline). Stale docs claiming `head` is always empty
are fixed (head hoisting has shipped for a while), `octane/server` now documents which
exports are the compiler's private ABI, and the vite plugin's dev RPC handler no longer
references a nonexistent `executeServerFunction` export: it now executes server
functions locally with the devalue wire format `@ripple-ts/adapter`'s client stub uses
(devalue-encoded argument array in, devalue-encoded `{ value }` envelope out). See the
new `docs/ssr.md` for the full SSR guide and the current gaps (streaming, selective
hydration, production server build).
