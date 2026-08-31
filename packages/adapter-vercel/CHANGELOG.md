# @octanejs/adapter-vercel

## 0.0.47

### Patch Changes

- @octanejs/app-core@0.0.46

## 0.0.46

### Patch Changes

- Updated dependencies [8adc693]
  - @octanejs/app-core@0.0.45

## 0.0.45

### Patch Changes

- Updated dependencies [9dda682]
  - @octanejs/app-core@0.0.44

## 0.0.44

### Patch Changes

- Updated dependencies [60581f4]
- Updated dependencies [7a639fd]
  - @octanejs/app-core@0.0.43

## 0.0.43

### Patch Changes

- @octanejs/app-core@0.0.42

## 0.0.42

### Patch Changes

- @octanejs/app-core@0.0.41

## 0.0.41

### Patch Changes

- @octanejs/app-core@0.0.40

## 0.0.40

### Patch Changes

- @octanejs/app-core@0.0.39

## 0.0.39

### Patch Changes

- Updated dependencies [afa3722]
  - @octanejs/app-core@0.0.38

## 0.0.38

### Patch Changes

- @octanejs/app-core@0.0.37

## 0.0.37

### Patch Changes

- @octanejs/app-core@0.0.36

## 0.0.36

### Patch Changes

- @octanejs/app-core@0.0.35

## 0.0.35

### Patch Changes

- @octanejs/app-core@0.0.34

## 0.0.34

### Patch Changes

- @octanejs/app-core@0.0.33

## 0.0.33

### Patch Changes

- @octanejs/app-core@0.0.32

## 0.0.32

### Patch Changes

- @octanejs/app-core@0.0.31

## 0.0.31

### Patch Changes

- @octanejs/app-core@0.0.30

## 0.0.30

### Patch Changes

- @octanejs/app-core@0.0.29

## 0.0.29

### Patch Changes

- @octanejs/app-core@0.0.28

## 0.0.28

### Patch Changes

- @octanejs/app-core@0.0.27

## 0.0.27

### Patch Changes

- @octanejs/app-core@0.0.26

## 0.0.26

### Patch Changes

- @octanejs/app-core@0.0.25

## 0.0.25

### Patch Changes

- @octanejs/app-core@0.0.24

## 0.0.24

### Patch Changes

- @octanejs/app-core@0.0.23

## 0.0.23

### Patch Changes

- @octanejs/app-core@0.0.22

## 0.0.22

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - @octanejs/app-core@0.0.21

## 0.0.21

### Patch Changes

- @octanejs/app-core@0.0.20

## 0.0.20

### Patch Changes

- @octanejs/app-core@0.0.19

## 0.0.19

### Patch Changes

- @octanejs/app-core@0.0.18

## 0.0.18

### Patch Changes

- @octanejs/app-core@0.0.17

## 0.0.17

### Patch Changes

- Updated dependencies [89323b7]
- Updated dependencies [89323b7]
- Updated dependencies [0a0b813]
- Updated dependencies [c151b71]
  - @octanejs/app-core@0.0.16

## 0.0.16

### Patch Changes

- @octanejs/app-core@0.0.15

## 0.0.15

### Patch Changes

- @octanejs/app-core@0.0.14

## 0.0.14

### Patch Changes

- Updated dependencies [eb69cb6]
  - @octanejs/app-core@0.0.13

## 0.0.13

### Patch Changes

- @octanejs/app-core@0.0.12

## 0.0.12

### Patch Changes

- @octanejs/app-core@0.0.11

## 0.0.11

### Patch Changes

- Updated dependencies [e19989d]
  - @octanejs/app-core@0.0.10

## 0.0.10

### Patch Changes

- Updated dependencies [3ffce4c]
  - @octanejs/app-core@0.0.9

## 0.0.9

### Patch Changes

- Updated dependencies [a88f9ea]
  - @octanejs/app-core@0.0.8

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
