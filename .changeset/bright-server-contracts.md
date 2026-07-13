---
"octane": patch
"@octanejs/vite-plugin": patch
"@octanejs/adapter-vercel": patch
---

Harden buffered and streaming SSR with render-scoped boundary IDs, Node and Web
backpressure/cancellation, request abort signals, and CSP nonces. Compile and
bundle `module server` RPC functions, load importable root boundaries across
development, production, and hydration, validate SSR templates, and preserve
stream lifecycle through HTML composition.

Keep async retry caches distinct across control arms, component keys/types, and
keyed value arrays; rewind discarded render-phase side effects; hydrate streamed
rejections through their server catch arm with catch-visible primitive,
plain-object, and Error reasons in collision-free seed metadata; and preserve
nested segment ordering and boundary-local IDs.

Update the Vercel output contract for response streaming and adjacent ISR
configuration, and publish the plugin/adapter with explicit peer, engine, and
tarball boundaries.
