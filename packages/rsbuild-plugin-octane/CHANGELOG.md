# @octanejs/rsbuild-plugin

## 0.1.17

### Patch Changes

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22
  - @octanejs/app-core@0.0.18
  - @octanejs/rspack-plugin@0.1.17

## 0.1.16

### Patch Changes

- Updated dependencies [10efc28]
- Updated dependencies [39bfc49]
- Updated dependencies [4863b39]
- Updated dependencies [ef82ba3]
  - octane@0.1.21
  - @octanejs/app-core@0.0.17
  - @octanejs/rspack-plugin@0.1.16

## 0.1.15

### Patch Changes

- c151b71: Add optional Strong mode for clearer state and ref behavior. Enable it across an
  application with `compiler: { strong: true }`, in one module with `"use strong"`,
  or through the Vite, Rspack, and Rsbuild plugin options. Strong modules reject
  state updates during render, direct state updates while setting up an effect, and
  render-time writes to refs, with `useLinkedState` available for state that
  should follow another value.
- Updated dependencies [c6370b6]
- Updated dependencies [89323b7]
- Updated dependencies [89323b7]
- Updated dependencies [0a0b813]
- Updated dependencies [dd272ad]
- Updated dependencies [c151b71]
- Updated dependencies [66b51d8]
- Updated dependencies [a57c32a]
- Updated dependencies [e38a557]
- Updated dependencies [bd90e27]
- Updated dependencies [ae6811d]
- Updated dependencies [62d81b8]
  - octane@0.1.20
  - @octanejs/app-core@0.0.16
  - @octanejs/rspack-plugin@0.1.15

## 0.1.14

### Patch Changes

- Updated dependencies [9d5d642]
- Updated dependencies [f469b3f]
- Updated dependencies [ac2ae2f]
- Updated dependencies [3aada64]
  - octane@0.1.19
  - @octanejs/app-core@0.0.15
  - @octanejs/rspack-plugin@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies [c3ba5e0]
- Updated dependencies [430061e]
- Updated dependencies [a21ff46]
- Updated dependencies [1821f63]
- Updated dependencies [3db74e9]
- Updated dependencies [0d4ed9e]
- Updated dependencies [7bdf1fa]
- Updated dependencies [e1927d8]
- Updated dependencies [dac0e66]
- Updated dependencies [54c60fa]
- Updated dependencies [59a95d6]
- Updated dependencies [138fbd9]
- Updated dependencies [50c1ab5]
- Updated dependencies [e0c5490]
- Updated dependencies [e6a158e]
  - octane@0.1.18
  - @octanejs/app-core@0.0.14
  - @octanejs/rspack-plugin@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies [bd31a2d]
- Updated dependencies [9e0ef45]
- Updated dependencies [dea219b]
- Updated dependencies [2374980]
- Updated dependencies [2374980]
- Updated dependencies [ac687f8]
- Updated dependencies [7997d39]
- Updated dependencies [eb69cb6]
  - octane@0.1.17
  - @octanejs/app-core@0.0.13
  - @octanejs/rspack-plugin@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies [85a1c6d]
- Updated dependencies [f4c97d8]
- Updated dependencies [f3543bf]
- Updated dependencies [dfa6d29]
- Updated dependencies [9fbf31a]
  - octane@0.1.16
  - @octanejs/app-core@0.0.12
  - @octanejs/rspack-plugin@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies [16dc385]
- Updated dependencies [7fa4075]
  - octane@0.1.15
  - @octanejs/app-core@0.0.11
  - @octanejs/rspack-plugin@0.1.10

## 0.1.9

### Patch Changes

- e19989d: Harden server functions with same-origin JSON POST validation, bounded request
  bodies, global authorization middleware, trusted-proxy-aware origin policies,
  and production-safe error responses across Vite, Rsbuild, and platform servers.
  Add hook-slot-safe Hotkeys and Pacer bindings, typed router-query SSR exports,
  and dedicated behavioral and type-check coverage for all three TanStack bindings.
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [3ea0855]
- Updated dependencies [08843da]
- Updated dependencies [8e01289]
- Updated dependencies [cc79ac5]
- Updated dependencies [3ea0855]
- Updated dependencies [f96e7c4]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [971ec0c]
- Updated dependencies [971ec0c]
- Updated dependencies [1145d98]
- Updated dependencies [e19989d]
- Updated dependencies [f96e7c4]
- Updated dependencies [07dff41]
- Updated dependencies [cc79ac5]
- Updated dependencies [3686e54]
  - octane@0.1.14
  - @octanejs/app-core@0.0.10
  - @octanejs/rspack-plugin@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies [a719b93]
- Updated dependencies [19c3ff1]
- Updated dependencies [6cecb47]
- Updated dependencies [d6ee673]
- Updated dependencies [9b6cd79]
- Updated dependencies [40d562b]
- Updated dependencies [3ffce4c]
- Updated dependencies [b92d76e]
- Updated dependencies [f325775]
- Updated dependencies [c36608c]
- Updated dependencies [5974429]
- Updated dependencies [af337d0]
- Updated dependencies [b5b5880]
  - octane@0.1.13
  - @octanejs/rspack-plugin@0.1.8
  - @octanejs/app-core@0.0.9

## 0.1.7

### Patch Changes

- a88f9ea: Add a Cloudflare Workers adapter for full-stack Octane apps. Vite and Rsbuild
  can now emit a Worker-targeted server bundle and a streaming module Worker for
  Workers Static Assets, with Cloudflare bindings and execution context available
  through request-scoped middleware and server-route context.

  Initialize streaming SSR token entropy on the first render so module evaluation
  remains valid in runtimes that prohibit random generation in global scope.

- f9234f6: Add Octane-owned production error codes with full development messages, compact
  documentation links in optimized builds, and progressive React-inspired developer
  diagnostics. Production Vite and Rsbuild server bundles now fold the runtime mode
  at build time so complete development diagnostics are removed without relying on
  server minification.
- Updated dependencies [a88f9ea]
- Updated dependencies [443bba7]
- Updated dependencies [d388e80]
- Updated dependencies [2f2a204]
- Updated dependencies [0223241]
- Updated dependencies [f9234f6]
- Updated dependencies [fa11116]
- Updated dependencies [ec7ffbf]
- Updated dependencies [25d266b]
- Updated dependencies [d388e80]
  - @octanejs/app-core@0.0.8
  - octane@0.1.12
  - @octanejs/rspack-plugin@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [f7e1cba]
- Updated dependencies [082b681]
- Updated dependencies [9d86d20]
- Updated dependencies [082b681]
- Updated dependencies [742ae9d]
- Updated dependencies [2932a23]
- Updated dependencies [e0c2f09]
- Updated dependencies [082b681]
- Updated dependencies [082b681]
  - octane@0.1.11
  - @octanejs/app-core@0.0.7
  - @octanejs/rspack-plugin@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [d426046]
- Updated dependencies [d426046]
- Updated dependencies [f511024]
  - @octanejs/app-core@0.0.6
  - octane@0.1.10
  - @octanejs/rspack-plugin@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [c704664]
- Updated dependencies [5b7d9ed]
- Updated dependencies [5b7d9ed]
- Updated dependencies [91b5f45]
- Updated dependencies [c16778a]
- Updated dependencies [39f2c00]
- Updated dependencies [aabf79c]
- Updated dependencies [07511e4]
- Updated dependencies [5b7d9ed]
- Updated dependencies [0d2e265]
- Updated dependencies [3168360]
- Updated dependencies [81c8842]
  - octane@0.1.9
  - @octanejs/app-core@0.0.5
  - @octanejs/rspack-plugin@0.1.4

## 0.1.3

### Patch Changes

- 2a5f44f: Add compiler-backed deferred hydration with the `Hydrate` component, hydration
  strategies, split-child loading and prefetching, SSR adoption, nested interaction
  replay, and eager CSS retention for deferred chunks in the Vite and Rsbuild app
  integrations.
- a12a3d9: Add the experimental universal renderer foundation: a bundler-neutral registry and filename resolver, static host-plan compiler target, core-owned logical topology and staged transactions, object test driver, and explicit DOM-to-universal boundary.
- 95b3081: Complete the experimental universal client renderer's core composition
  semantics: nested component owners, template directives and spreads,
  transactional renderer events, and statically declared renderer-owned child
  regions in both DOM-to-universal and universal-to-DOM directions. Normalize
  and forward boundary metadata consistently across direct compilation, Vite,
  Rspack, and Rsbuild while preserving authored source maps and normal universal
  HMR, profiling, and parallel-use planning. Add the experimental boundary
  configuration schema and the reverse DOM owner bridge used by compiled child
  regions.
- 1114904: Add production-validated client-only Canvas SSR and hydration through Vite and Rsbuild, with the equivalent raw Rspack client/server graph split. Ensure Rsbuild browser environments replace Octane's `process.env.NODE_ENV` runtime guards during programmatic production builds.
- 1b21731: Keep routed hydration compatible with nonce-only Content Security Policies by
  using canonical native dynamic imports and module-relative production preload
  URLs that ignore authored document bases without duplicating page or
  pre-hydrate module singletons.
- 3445fa6: Add a `requireDirective` option to every bundler integration for mixed-toolchain
  codebases (for example a React app hosting Octane islands via `octane/react`).
  When enabled, Octane compiles only project modules that open with a
  `'use octane'` directive: undirected project `.tsx`/`.ts`/`.js` pass through to
  the host framework's own pipeline (with a warning when they import from
  `octane`), an undirected project `.tsrx` is a build error, and installed or
  linked packages keep their Octane package-manifest decision. Paths routed
  through a different tsrx compiler (for example `@tsrx/react`) can be carved out
  with the integration's `exclude` option — excluded paths are never Octane's in
  this mode, even when a file declares the directive. The directive is purely an
  Octane-compilation ownership marker (not part of the tsrx language), composes
  with `'use client'`, is stripped from compiled output, and is tolerated even
  when the option is off. Client-only classification (`clientReferenceForFile`)
  applies the same ownership gate, so importers never hold a client reference
  for a module whose own transform passes through to the host toolchain.
- d63b0d0: Extend the experimental universal renderer SDK with prepared host acceptance,
  stable-ID recreation, lifecycle and local callbacks, scoped events, prop
  codecs/resource handles, typed text and intrinsic metadata, and retained
  Activity/Suspense visibility. Add client-only renderer server stubs, omitted
  boundary regions, live-use diagnostics, and stable cross-adapter client
  reference manifests for DOM-shell hydration.
- dbbcee1: Make Suspense waterfall elimination unconditional across the compiler and its
  bundler integrations. Remove the `parallelUse` configuration flag so compiled
  builds always run the conservative memoization, batched-unwrap, and eligible
  descendant-warming analysis. The rspack plugin rejects the removed option
  loudly; the vite plugin warns once that a passed `parallelUse` is ignored, so
  the timing change is never silent on upgrade.
- Updated dependencies [156f213]
- Updated dependencies [2a5f44f]
- Updated dependencies [f8e94f2]
- Updated dependencies [a12a3d9]
- Updated dependencies [1b21731]
- Updated dependencies [7a123d2]
- Updated dependencies [95b3081]
- Updated dependencies [38d95eb]
- Updated dependencies [ba36091]
- Updated dependencies [6ccdbce]
- Updated dependencies [1b21731]
- Updated dependencies [d1bb5c3]
- Updated dependencies [9c21887]
- Updated dependencies [674f1a4]
- Updated dependencies [6ceab55]
- Updated dependencies [3445fa6]
- Updated dependencies [6cfb63d]
- Updated dependencies [c68562b]
- Updated dependencies [4de2b4f]
- Updated dependencies [6868005]
- Updated dependencies [01a20fb]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [7efdbdd]
- Updated dependencies [314b38d]
- Updated dependencies [dcd2707]
- Updated dependencies [d63b0d0]
- Updated dependencies [39e779c]
- Updated dependencies [1b21731]
- Updated dependencies [f07c628]
- Updated dependencies [fac1c66]
- Updated dependencies [dbbcee1]
- Updated dependencies [5287eac]
  - octane@0.1.8
  - @octanejs/app-core@0.0.4
  - @octanejs/rspack-plugin@0.1.3

## 0.1.2

### Patch Changes

- eaacd17: Add opt-in client profiling builds across Vite, Rspack, Rsbuild, and MDX, with component timings, render causes, Chrome custom tracks, and a bounded console and trace API.
- Updated dependencies [eaacd17]
- Updated dependencies [93dcb81]
- Updated dependencies [6852df7]
- Updated dependencies [b00cd74]
- Updated dependencies [e9852d4]
  - octane@0.1.7
  - @octanejs/rspack-plugin@0.1.2
  - @octanejs/app-core@0.0.3

## 0.1.1

### Patch Changes

- b41a91a: Add a bundler-neutral Octane compiler and app core, a low-level Rspack 2
  compiler integration, and a full Rsbuild 2 metaframework plugin with routing,
  streaming SSR, hydration, HMR, production client/server builds, preview, and
  adapter support. Keep the existing Vite integration on the same shared core.
- Updated dependencies [d173805]
- Updated dependencies [85e589e]
- Updated dependencies [2979f42]
- Updated dependencies [b41a91a]
- Updated dependencies [e55f6ed]
- Updated dependencies [d173805]
- Updated dependencies [813fd50]
  - octane@0.1.6
  - @octanejs/app-core@0.0.2
  - @octanejs/rspack-plugin@0.1.1
