# @octanejs/adapter-vercel

## 0.0.8

### Patch Changes

- Updated dependencies [9d86d20]
  - @octanejs/app-core@0.0.7

## 0.0.7

### Patch Changes

- Updated dependencies [d426046]
  - @octanejs/app-core@0.0.6

## 0.0.6

### Patch Changes

- @octanejs/app-core@0.0.5

## 0.0.5

### Patch Changes

- Updated dependencies [f8e94f2]
- Updated dependencies [a12a3d9]
- Updated dependencies [95b3081]
- Updated dependencies [1b21731]
- Updated dependencies [6cfb63d]
- Updated dependencies [01a20fb]
- Updated dependencies [d63b0d0]
  - @octanejs/app-core@0.0.4

## 0.0.4

### Patch Changes

- @octanejs/app-core@0.0.3

## 0.0.3

### Patch Changes

- d173805: Harden buffered and streaming SSR with render-scoped boundary IDs, Node and Web
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

- b41a91a: Add a bundler-neutral Octane compiler and app core, a low-level Rspack 2
  compiler integration, and a full Rsbuild 2 metaframework plugin with routing,
  streaming SSR, hydration, HMR, production client/server builds, preview, and
  adapter support. Keep the existing Vite integration on the same shared core.
- Updated dependencies [b41a91a]
  - @octanejs/app-core@0.0.2

## 0.0.2

### Patch Changes

- 6d332ad: New package: Vercel adapter (Build Output API v3). `adapter: vercel()` in octane.config.ts makes `vite build` emit `.vercel/output` — the hashed client assets as static files plus one self-contained Node serverless function wrapping the SSR handler (the plugin's server bundle is self-contained, so no dependency tracing is needed). Options cover the serverless function (runtime/regions/memory/maxDuration), ISR, cleanUrls/trailingSlash, extra headers, and redirects; routing is filesystem-first with everything else — including the 404 catch-all — server-rendered by the function.
