# @octanejs/vite-plugin

## 0.1.50

### Patch Changes

- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50
  - @octanejs/app-core@0.0.46

## 0.1.49

### Patch Changes

- 8adc693: Add an opt-in experimental scoped signal engine backed by Alien Signals 3.2.0, with owned async resources, retained values, ready-state adoption, and native compiler read tracking. Expose the `nativeReads` compiler option through the application and bundler integrations while preserving explicit hook dependency arrays and the external Alien Signals binding.

  The experiment is not a stable API or a release recommendation. Local derived and async hooks remain deferred, and the accompanying evidence distinguishes supplemental compiler, runtime, and browser checks from the acceptance gates for the locked workspace.

  Expose native read ownership and cached activity metadata through the existing DevTools inspector without evaluating signals or retaining a global graph registry. Match the private compiler ABI's CommonJS entry points to the public runtime so native SSR reads use one protocol instance.

  Collect native reads around actual component invocation, including parameter defaults and indirect returns. Track and replay native reads in inferred memos, preserve deferred element inspection and rendering, and revoke live retained results when a contributing data owner retires. Keep held Suspense output, refs, effects, and native subscriptions together until replacement work is accepted.

  Avoid duplicate native collection setup when invocation collection already owns the scope, while preserving independent child retirement, observer restoration, write guards, and stored-value witness replay.

  Preserve nested Suspense ref lifetimes, finish caught deletion cleanup before replacement effects connect, and reveal the latest urgent state when it supersedes every held state update. Register native compiler and server hook diagnostics in the production error catalog and CLI explanations.

- Updated dependencies [8adc693]
- Updated dependencies [a51c8c6]
  - octane@0.1.49
  - @octanejs/app-core@0.0.45

## 0.1.48

### Patch Changes

- bba4cd0: Cache small complete CSS results while mapping routes through a shared Vite
  manifest graph. Expose the accompanying client-asset benchmark through the
  Octane MCP benchmark tool.
- Updated dependencies [3ca30fc]
- Updated dependencies [efdc8cb]
- Updated dependencies [922df8c]
- Updated dependencies [9dda682]
- Updated dependencies [8a8afd8]
- Updated dependencies [37a8ca1]
- Updated dependencies [c84edbb]
- Updated dependencies [d5175ca]
- Updated dependencies [4a4996e]
  - octane@0.1.48
  - @octanejs/app-core@0.0.44

## 0.1.47

### Patch Changes

- Updated dependencies [60581f4]
- Updated dependencies [7a639fd]
- Updated dependencies [af0d999]
- Updated dependencies [c800a1f]
- Updated dependencies [c1bb057]
- Updated dependencies [97b9349]
- Updated dependencies [4393bea]
- Updated dependencies [7dfef16]
- Updated dependencies [7e62361]
- Updated dependencies [964783a]
- Updated dependencies [d3dbd78]
  - @octanejs/app-core@0.0.43
  - octane@0.1.47

## 0.1.46

### Patch Changes

- Updated dependencies [7e96f71]
- Updated dependencies [d7226ff]
  - octane@0.1.46
  - @octanejs/app-core@0.0.42

## 0.1.45

### Patch Changes

- Updated dependencies [5b1e6a3]
- Updated dependencies [31abee5]
- Updated dependencies [fd6ce69]
- Updated dependencies [5f7a457]
- Updated dependencies [5227d7b]
- Updated dependencies [6927595]
- Updated dependencies [f1a7802]
  - octane@0.1.45
  - @octanejs/app-core@0.0.41

## 0.1.44

### Patch Changes

- Updated dependencies [9b06e47]
- Updated dependencies [7535acd]
  - octane@0.1.44
  - @octanejs/app-core@0.0.40

## 0.1.43

### Patch Changes

- 6a68a7d: Fold provider-proven immutable CSS-module class strings before template planning. Production Vite builds retain a live class reference in each static subtree so unused and lazy component styles keep their existing delivery boundaries. Mutable default maps remain dynamic unless their CSS provider supplies an explicit immutable-export contract.
- Updated dependencies [4b590bd]
- Updated dependencies [c0ff085]
- Updated dependencies [6a68a7d]
- Updated dependencies [6b97f85]
  - octane@0.1.43
  - @octanejs/app-core@0.0.39

## 0.1.42

### Patch Changes

- Updated dependencies [1581e1b]
- Updated dependencies [afa3722]
- Updated dependencies [afa3722]
- Updated dependencies [231e248]
- Updated dependencies [2f9b301]
- Updated dependencies [939c64d]
  - octane@0.1.42
  - @octanejs/app-core@0.0.38

## 0.1.41

### Patch Changes

- Updated dependencies [489a886]
- Updated dependencies [922b2d4]
- Updated dependencies [814a3c1]
  - octane@0.1.41
  - @octanejs/app-core@0.0.37

## 0.1.40

### Patch Changes

- Updated dependencies [ff9b859]
- Updated dependencies [14b8b40]
- Updated dependencies [cc6e5ea]
  - octane@0.1.40
  - @octanejs/app-core@0.0.36

## 0.1.39

### Patch Changes

- Updated dependencies [954028b]
- Updated dependencies [21f4dfb]
- Updated dependencies [1cb4a19]
- Updated dependencies [0fc84da]
  - octane@0.1.39
  - @octanejs/app-core@0.0.35

## 0.1.38

### Patch Changes

- Updated dependencies [0635af6]
  - octane@0.1.38
  - @octanejs/app-core@0.0.34

## 0.1.37

### Patch Changes

- Updated dependencies [954c75f]
- Updated dependencies [94fa199]
- Updated dependencies [c2e77a3]
- Updated dependencies [125c861]
- Updated dependencies [765134a]
- Updated dependencies [9efd6f4]
- Updated dependencies [603756a]
  - octane@0.1.37
  - @octanejs/app-core@0.0.33

## 0.1.36

### Patch Changes

- Updated dependencies [972fdd3]
- Updated dependencies [4a792e3]
- Updated dependencies [581b8bd]
- Updated dependencies [24aa236]
- Updated dependencies [9c397a2]
- Updated dependencies [24aa236]
- Updated dependencies [5377ef3]
- Updated dependencies [6b65644]
- Updated dependencies [f12a9a9]
- Updated dependencies [972fdd3]
- Updated dependencies [1039b7d]
- Updated dependencies [ffadd39]
- Updated dependencies [a03ff0f]
- Updated dependencies [4c1ecd1]
  - octane@0.1.36
  - @octanejs/app-core@0.0.32

## 0.1.35

### Patch Changes

- Updated dependencies [50b7988]
- Updated dependencies [6daa380]
- Updated dependencies [d2c9e1c]
- Updated dependencies [01240e6]
- Updated dependencies [59a35ae]
- Updated dependencies [a8b432b]
- Updated dependencies [910c240]
- Updated dependencies [db5687e]
- Updated dependencies [e2466a5]
- Updated dependencies [2d06817]
  - octane@0.1.35
  - @octanejs/app-core@0.0.31

## 0.1.34

### Patch Changes

- Updated dependencies [78316b4]
- Updated dependencies [4e53ef4]
- Updated dependencies [4cc7840]
- Updated dependencies [39b3e19]
- Updated dependencies [8c29020]
- Updated dependencies [97e65b9]
  - octane@0.1.34
  - @octanejs/app-core@0.0.30

## 0.1.33

### Patch Changes

- Updated dependencies [1fe297e]
- Updated dependencies [db0d495]
- Updated dependencies [677182d]
- Updated dependencies [3fb96df]
- Updated dependencies [677182d]
- Updated dependencies [4653a2e]
- Updated dependencies [7282555]
- Updated dependencies [3d09348]
- Updated dependencies [8cb40df]
- Updated dependencies [677182d]
- Updated dependencies [fc1c146]
- Updated dependencies [a84fcaa]
- Updated dependencies [217a0b5]
  - octane@0.1.33
  - @octanejs/app-core@0.0.29

## 0.1.32

### Patch Changes

- Updated dependencies [d453832]
- Updated dependencies [3152f0b]
- Updated dependencies [1c44117]
- Updated dependencies [cbd55ca]
- Updated dependencies [cdb501c]
  - octane@0.1.32
  - @octanejs/app-core@0.0.28

## 0.1.31

### Patch Changes

- Updated dependencies [80a9c7e]
- Updated dependencies [62d7f13]
- Updated dependencies [16df26e]
  - octane@0.1.31
  - @octanejs/app-core@0.0.27

## 0.1.30

### Patch Changes

- Updated dependencies [10011bb]
- Updated dependencies [081fa1e]
- Updated dependencies [60004f0]
- Updated dependencies [27758f5]
- Updated dependencies [136b0e3]
- Updated dependencies [d69ab86]
- Updated dependencies [1a27e19]
- Updated dependencies [7f6a134]
- Updated dependencies [ce68bb8]
- Updated dependencies [fbe0d39]
- Updated dependencies [9fa0b47]
  - octane@0.1.30
  - @octanejs/app-core@0.0.26

## 0.1.29

### Patch Changes

- Updated dependencies [8fb7990]
  - octane@0.1.29
  - @octanejs/app-core@0.0.25

## 0.1.28

### Patch Changes

- Updated dependencies [2b98a33]
  - octane@0.1.28
  - @octanejs/app-core@0.0.24

## 0.1.27

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27
  - @octanejs/app-core@0.0.23

## 0.1.26

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26
  - @octanejs/app-core@0.0.22

## 0.1.25

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - @octanejs/app-core@0.0.21
  - octane@0.1.25

## 0.1.24

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24
  - @octanejs/app-core@0.0.20

## 0.1.23

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23
  - @octanejs/app-core@0.0.19

## 0.1.22

### Patch Changes

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22
  - @octanejs/app-core@0.0.18

## 0.1.21

### Patch Changes

- Updated dependencies [10efc28]
- Updated dependencies [39bfc49]
- Updated dependencies [4863b39]
- Updated dependencies [ef82ba3]
  - octane@0.1.21
  - @octanejs/app-core@0.0.17

## 0.1.20

### Patch Changes

- 89323b7: Fail the boot on a `module server` function id collision instead of silently
  rerouting one function's calls to another.

  An id is `strong_hash("<module>#<export>")`, a SHA-256 truncated to 8 hex
  characters, whose own documentation calls it "fine for identification, not for
  authentication". Both registration paths were a plain Map set, which resolves a
  collision by overwriting: one function became unreachable and every call to it
  executed the other one instead, under whatever authorization that other function
  carries. Nothing reported it, and which function wins depends on module
  evaluation order.

  Dev registers through `globalThis.rpc_modules`, which is now built by
  `createRpcRegistry()` and rejects a second declaration under an id another export
  already took. Re-registering the same export stays a no-op, which module reloads
  depend on. Production builds its descriptor map from the server manifest and
  throws from `createHandler` on a duplicate id, before serving a request.

  Both report the two colliding module paths and export names, and say that
  renaming either export resolves it. This does not widen the id: 32 bits stays
  narrow enough to collide at scale, but the failure is now loud and happens at
  build or boot rather than in production traffic.

- 89323b7: Tell middleware which server function an RPC request targets, so authorization
  can be written per function instead of per endpoint.

  `options.middlewares` is one chain for the whole RPC boundary, and the only
  identifying thing in the request was a compiler-assigned hash in the URL. A
  policy could authenticate the caller but could not express "the admin functions
  require an admin role" without hard-coding hashes that change on rename.

  `Context.rpc` now names the target, and is populated before the middleware chain
  runs:

  ```ts
  const authorize: Middleware = async (context, next) => {
  	if (context.rpc?.module === '/src/admin.ts' && !isAdmin(context)) {
  		return new Response('Forbidden', { status: 403 });
  	}
  	return next();
  };
  ```

  The mapping comes from a new optional `describeFunction(hash)` on
  `RpcRequestOptions`, which names an export without loading its module and is
  synchronous so the middleware chain never waits on it. The Vite plugin reads the
  dev registration map, and the production handler builds descriptors from the
  server manifest once per handler, because `build_rpc_lookup` keeps only the
  namespace object and export name. An integration that omits `describeFunction`
  gets `module` and `export` as `null`, which a per-function policy will not match,
  so a hand-rolled boundary must supply it before relying on one.

  `rpc.id` is the raw hash and is stable only within a build; authorize on
  `module`/`export`. Unauthorized requests already never reached the target
  function, since `resolveFunction` runs as the middleware chain's final handler;
  this adds the identity that was missing, not a new ordering guarantee.

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

## 0.1.19

### Patch Changes

- Updated dependencies [9d5d642]
- Updated dependencies [f469b3f]
- Updated dependencies [ac2ae2f]
- Updated dependencies [3aada64]
  - octane@0.1.19
  - @octanejs/app-core@0.0.15

## 0.1.18

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

## 0.1.17

### Patch Changes

- eb69cb6: Authored `<title>`/`<meta>`/`<link>` now reach the real `<head>` in file-routed
  SSR apps. The route renders into the template's `<div id="root">`, not a
  document, so core's head fold had no `</head>` to target and prepended the
  metadata inside `#root` instead: the template's `<title>` won by document order,
  `link rel="canonical"` and `meta name="description"` were ignored where they
  landed, and hydration could not find the ownership markers in `document.head` so
  it appended duplicates.

  New opt-in `RenderOptions.headChannel: 'separate'` withholds hoisted metadata
  from `html`/the streamed shell and hands it over on its own, through
  `RenderResult.head` for the buffered renderers and the new
  `StreamOptions.onHeadReady(head)` for the streaming ones (called before the shell
  is written, so a host can still place it in the template prefix). Both the dev
  server and the production handler use it and splice at `<!--ssr-head-->`.

  The default stays `'fold'` and is unchanged: same bytes, same result shape, no
  `head` field. Core does not dedupe metadata, so a `<title>` in `index.html` and
  one in a component both still ship.

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

## 0.1.16

### Patch Changes

- Updated dependencies [85a1c6d]
- Updated dependencies [f4c97d8]
- Updated dependencies [f3543bf]
- Updated dependencies [dfa6d29]
- Updated dependencies [9fbf31a]
  - octane@0.1.16
  - @octanejs/app-core@0.0.12

## 0.1.15

### Patch Changes

- Updated dependencies [16dc385]
- Updated dependencies [7fa4075]
  - octane@0.1.15
  - @octanejs/app-core@0.0.11

## 0.1.14

### Patch Changes

- e19989d: Harden server functions with same-origin JSON POST validation, bounded request
  bodies, global authorization middleware, trusted-proxy-aware origin policies,
  and production-safe error responses across Vite, Rsbuild, and platform servers.
  Add hook-slot-safe Hotkeys and Pacer bindings, typed router-query SSR exports,
  and dedicated behavioral and type-check coverage for all three TanStack bindings.
- 971ec0c: Add an `octane({ devtools: true })` option that auto-enables the profile compile
  flag in dev (via a command-aware `profile: 'auto'` resolution) and off in
  production builds, powering the new `@octanejs/devtools` plugin.
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

## 0.1.13

### Patch Changes

- 3ffce4c: Update the TSRX compiler adapters and Ripple integration to their synchronized
  latest releases, including the nested-JSX slash parsing fix and Solid 2 beta.15
  alignment. Refresh the supported dependency ranges shipped by the affected
  framework bindings and build integrations.
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
  - @octanejs/app-core@0.0.9

## 0.1.12

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

## 0.1.11

### Patch Changes

- 723058d: Fix the dev SSR error page printing the raw route `entry` tuple. A route
  configured with the `[exportName, modulePath]` tuple form rendered as the
  comma-joined array (`Post,/src/Post.tsrx`) on the 500 error overlay; it now
  resolves the module path through `get_route_entry_path`, "matching how the
  renderer resolves the entry path everywhere else.
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

## 0.1.10

### Patch Changes

- Updated dependencies [d426046]
- Updated dependencies [d426046]
- Updated dependencies [f511024]
  - @octanejs/app-core@0.0.6
  - octane@0.1.10

## 0.1.9

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

## 0.1.8

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
- 1b21731: Keep routed hydration compatible with nonce-only Content Security Policies by
  using canonical native dynamic imports and module-relative production preload
  URLs that ignore authored document bases without duplicating page or
  pre-hydrate module singletons.
- c68562b: Dev-server hydrate entry now maps route entries, layouts, preHydrate, and root boundaries as literal dynamic imports (as production already did), so they load through Vite's import analysis and share module-instance identity with the page's own import chain. Previously the analysis-hidden fallback import fetched timestamp-less URLs after an HMR invalidation, creating duplicate browser module instances (e.g. two app-router singletons) that broke hydration on every reload until the dev server restarted.
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
- 6cfb63d: Report browser-repaired HTML nesting with authored locations during development SSR, and collect module style-map CSS while rendering so server and hydrated layouts use the same styles.

  Negotiate streaming gzip in the built-in Node HTTP transport for eligible SSR and static text responses, including the `octane-preview` path.

- d63b0d0: Extend the experimental universal renderer SDK with prepared host acceptance,
  stable-ID recreation, lifecycle and local callbacks, scoped events, prop
  codecs/resource handles, typed text and intrinsic metadata, and retained
  Activity/Suspense visibility. Add client-only renderer server stubs, omitted
  boundary regions, live-use diagnostics, and stable cross-adapter client
  reference manifests for DOM-shell hydration.
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

## 0.1.7

### Patch Changes

- eaacd17: Add opt-in client profiling builds across Vite, Rspack, Rsbuild, and MDX, with component timings, render causes, Chrome custom tracks, and a bounded console and trace API.
- Updated dependencies [eaacd17]
- Updated dependencies [93dcb81]
- Updated dependencies [6852df7]
- Updated dependencies [b00cd74]
- Updated dependencies [e9852d4]
  - octane@0.1.7
  - @octanejs/app-core@0.0.3

## 0.1.6

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

- 4093775: Preserve Vite's standard SPA HTML handling when no `octane.config.ts` exists, so
  the same recommended plugin works for client-only SPAs and routed full apps.
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

## 0.1.5

### Patch Changes

- Updated dependencies [940ae5a]
- Updated dependencies [6fceaf3]
- Updated dependencies [62da8cc]
- Updated dependencies [e737057]
  - octane@0.1.5

## 0.1.4

### Patch Changes

- 6d332ad: octane.config `adapter` is now the full deploy contract `{ name?, adapt?, serve?, runtime? }`: after the production server build, closeBundle runs `adapter.adapt({ root, outDir, clientDir, serverDir, log })` so an adapter package (e.g. `@octanejs/adapter-vercel`) can restructure the output for its platform (SvelteKit-style). All parts are optional and independent — `serve`/`runtime` keep their existing meanings. `@octanejs/adapter-vercel` is registered as a server-only package: client-side imports of it resolve to the browser stub (which now also covers the octane adapter surface, `vercel`/`adapt`) instead of dragging node builtins into the client graph.
- 8fc8554: Production SSR builds — octane apps now deploy server-rendered instead of SPA-only:

  - `vite build` produces BOTH bundles: hashed client assets in `{outDir}/client` (with the generated hydrate entry bundled into index.html via a static, Rollup-analyzable import map over the routes' entry/layout/preHydrate modules) and a self-contained SSR server at `{outDir}/server/entry.js` (app + octane bundled, only node builtins external; octane.config.ts is compiled in through a config-surface facade so neither the compiler nor vite ride along). The built index.html moves to `dist/server` — it is the SSR template, and leaving it in the static dir would shadow the handler at `/` on filesystem-first hosts.
  - `createHandler` (`@octanejs/vite-plugin/production`) is implemented: it matches RenderRoutes/ServerRoutes, runs middleware chains, and streams via the same `renderToReadableStream` engine dev SSR uses — the rendered body region and the `#__octane_data` payload are byte-identical to dev, so `hydrateRoot()` adopts production responses unchanged (covered by an end-to-end fixture test). Per-route `<link rel="stylesheet">`/`modulepreload` tags come from the client manifest. `server.render: 'buffered'` in octane.config.ts switches to the await-everything `prerender` for hosts that break streamed responses.
  - The server entry exports `handler` (Web fetch) and `nodeHandler` (Node `(req, res)`, for serverless wrappers such as a Vercel Node function), and auto-boots under `node dist/server/entry.js` — with the adapter's `serve()` when configured, else the new built-in Node server (`@octanejs/vite-plugin/node`) serving the client assets with immutable caching for `/assets/*`.
  - `octane-preview` now runs that entry for real (pre-deploy verification) and accepts `--port`.

- 3c56d95: Close the four metaframework gaps the octane website surfaced:

  - `octane()` now accepts `exclude` and forwards it to the bundled compiler, so monorepo / aliased-to-source setups can skip the hook-slotting pass for hand-slot-forwarding binding sources (pnpm symlinks resolve `@octanejs/*` to `packages/*/src`, which the automatic node_modules skip can't see).
  - The dev SSR middleware skips Vite-owned requests (`/@` namespaces, `/__` internals, node_modules, `?import`-style transform queries, and extension-bearing paths that name a real file under the Vite root/publicDir — dotted page URLs like `/docs/v2.0` still SSR) before route matching, so a catch-all `'/*splat'` RenderRoute can SSR a real not-found page without swallowing `/@vite/client` or `/src/*.ts`. `RenderRoute` also takes a `status` (e.g. 404 for the catch-all) applied to the rendered response.
  - `appType: 'custom'` is now only a default: an explicit user `appType` wins, and `vite preview` is left on Vite's own SPA fallback so it can serve the client build (production SSR serving is still Phase 2).
  - RenderRoute components (and layouts) receive the request `url` (pathname + search) alongside `params`, on the server and on the hydrating client, and the new `router.preHydrate` config names a module whose default export the client entry awaits before `hydrateRoot` — the hook an app-level client router uses to commit its match tree so hydration adopts the server DOM. The generated client entry also hides its dynamic imports from Vite's `?import` query injection so the page/hook share module singletons with statically-imported copies.

  Dev SSR now streams: RenderRoutes render through `renderToReadableStream` (shell first, suspense boundaries flush out of order behind it) instead of the buffered `prerender`.

- Updated dependencies [05fdef8]
- Updated dependencies [e9ebfbf]
- Updated dependencies [4ac4c98]
- Updated dependencies [c2129eb]
- Updated dependencies [4ac4c98]
- Updated dependencies [8a44bb5]
- Updated dependencies [6b0c244]
- Updated dependencies [d3cf678]
- Updated dependencies [05fdef8]
- Updated dependencies [d19d4f3]
- Updated dependencies [7e84258]
- Updated dependencies [2f8c6ed]
- Updated dependencies [8de4584]
- Updated dependencies [9be6ba5]
- Updated dependencies [db409de]
- Updated dependencies [4f3c6c8]
- Updated dependencies [62c3c4e]
- Updated dependencies [3c56d95]
- Updated dependencies [4c5b1d0]
- Updated dependencies [b732399]
- Updated dependencies [6d27cb0]
- Updated dependencies [a3784b1]
- Updated dependencies [fa77edf]
- Updated dependencies [f5c9dba]
- Updated dependencies [12d5410]
- Updated dependencies [d71f1fc]
- Updated dependencies [2f8c6ed]
- Updated dependencies [63e51e8]
- Updated dependencies [6d3b269]
- Updated dependencies [b171c6d]
- Updated dependencies [7f3d9c9]
- Updated dependencies [820baaf]
- Updated dependencies [c36cb32]
- Updated dependencies [c33f409]
- Updated dependencies [63e51e8]
- Updated dependencies [8fc8554]
- Updated dependencies [569daad]
- Updated dependencies [6b7b727]
- Updated dependencies [2ce7bc5]
- Updated dependencies [c6a23f5]
- Updated dependencies [c93aad5]
- Updated dependencies [2942afb]
- Updated dependencies [388b23c]
- Updated dependencies [352cff1]
- Updated dependencies [c7989eb]
- Updated dependencies [dda2854]
- Updated dependencies [dda2854]
- Updated dependencies [3a9d855]
- Updated dependencies [1f85217]
  - octane@0.1.4

## 0.1.3

### Patch Changes

- 3431ec3: SSR: the buffered renderers (`renderToString`/`renderToStaticMarkup` in
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
- Updated dependencies [71b5167]
- Updated dependencies [7b2acbd]
- Updated dependencies [a000fa2]
- Updated dependencies [71b5167]
- Updated dependencies [735f5ca]
- Updated dependencies [634c4b4]
- Updated dependencies [1987d47]
- Updated dependencies [fda2200]
- Updated dependencies [71b5167]
- Updated dependencies [fda2200]
- Updated dependencies [3431ec3]
- Updated dependencies [3afe217]
- Updated dependencies [1a1f1db]
- Updated dependencies [3431ec3]
- Updated dependencies [5e3858f]
- Updated dependencies [d2afbbb]
- Updated dependencies [1987d47]
- Updated dependencies [eb48930]
- Updated dependencies [3431ec3]
- Updated dependencies [87c5bc3]
  - octane@0.1.3

## 0.1.2

### Patch Changes

- b3a9191: Rename `hydrate` → `hydrateRoot` and adopt React 18's shape. The hydration entry is now `hydrateRoot(container, <App/>)` — container first — and returns a full `Root` (with `.render()` and `.unmount()`), symmetric with `createRoot`. Previously `hydrate(Component, container, props)` put the component first and returned only `{ unmount }`. After hydration the returned root's `.render()` performs a normal client update against the adopted DOM (no re-hydration). The vite-plugin's generated client entry now imports and calls `hydrateRoot`.
- 43d940d: Exclude `@octanejs/tanstack-query` from esbuild pre-bundling (optimizeDeps.exclude + ssr.noExternal). It ships a `.tsrx` provider component, so — like `octane` itself — its source must flow through the octane `.tsrx` transform rather than being pre-bundled by esbuild.
- cb9ad82: Rename the project from `vyre` to `octane`. The runtime now publishes as `octane` and the Vite metaframework plugin as `@octanejs/vite-plugin`. Identifiers inherited from the Ripple fork were also renamed to Octane (e.g. `setIsRippleActEnvironment` → `setIsOctaneActEnvironment`, the metaframework `ripple()` plugin → `octane()`, and the `ripple.config.ts` convention → `octane.config.ts`). References to the upstream Ripple framework and its `@ripple-ts`/`@tsrx` packages are unchanged.
- fcac573: Unify the server-rendering ABI to props-first, matching the client. A component body is now invoked as `(props, scope, extra)` on the server (it used to be `(scope, props, extra)`). This makes a plain `function Foo(props)` used at a `<Foo/>` site work the same on the server as on the client — including components that return a non-JSX value (a primitive coerced to text, an early return, `null`). SSR markup is unchanged (only the invocation order flipped), so hydration is unaffected. The server layout/page wrappers in the vite-plugin were updated to match.
- 634fd52: Align the SSR API with React and reshape the render result to `{ html, css }`.

  The octane-invented `render(Component, props) → { head, body, css }` is replaced by
  React-aligned entry points:

  - `octane/server` (mirrors `react-dom/server`):
    - `renderToString(element, props?, options?)` — a single synchronous pass; a Suspense
      boundary that suspends renders its `@pending` fallback (no awaiting).
    - `renderToStaticMarkup(element, props?, options?)` — clean, non-hydratable HTML (no block
      or head-adoption markers, no suspense seed script).
  - `octane/static` (NEW subpath, mirrors `react-dom/static`):
    - `prerender(element, props?, options?)` — the await-everything behaviour of the old
      `render()`: all Suspense data resolves and success arms render, returning complete HTML.

  All three return `{ html, css }`. The separate `head` field is gone — hoisted `<title>`/
  `<meta>`/`<link>` fold into `html` (spliced into `<head>` when the render produced a
  document, else prepended), matching React 19's resource hoisting. `css` remains a distinct
  field (octane has scoped CSS that React core does not). `render` is removed; the vite
  plugin's dev SSR now uses `prerender`.

- b3a9191: Fix the generated client hydration entry for routes with a layout. The layout's `children` ComponentBody was emitted with the old scope-first calling convention (`(s) => Component(s, { params })`), but octane's client runtime invokes a function child props-first as `({}, block, extra)` — so the page received the block as its props and rendered without its route data. The closure now calls `Component({ params }, scope, extra)`.
- Updated dependencies [c19f1aa]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [169c7c6]
- Updated dependencies [86ae0c5]
- Updated dependencies [357f841]
- Updated dependencies [6675ac7]
- Updated dependencies [f414710]
- Updated dependencies [894d51c]
- Updated dependencies [f44fb6b]
- Updated dependencies [056c441]
- Updated dependencies [aa9cc6e]
- Updated dependencies [0f57f20]
- Updated dependencies [f44fb6b]
- Updated dependencies [067efa3]
- Updated dependencies [f0c6c4d]
- Updated dependencies [dd24fd5]
- Updated dependencies [524939e]
- Updated dependencies [e8ee0a8]
- Updated dependencies [b680431]
- Updated dependencies [524939e]
- Updated dependencies [7f8dbc0]
- Updated dependencies [a13acd1]
- Updated dependencies [067efa3]
- Updated dependencies [524939e]
- Updated dependencies [894d51c]
- Updated dependencies [894d51c]
- Updated dependencies [1960647]
- Updated dependencies [e8ee0a8]
- Updated dependencies [93e2733]
- Updated dependencies [149800c]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [169c7c6]
- Updated dependencies [bbc3275]
- Updated dependencies [ed6afad]
- Updated dependencies [40bcb16]
- Updated dependencies [c842fb7]
- Updated dependencies [c62efa7]
- Updated dependencies [524939e]
- Updated dependencies [b3a9191]
- Updated dependencies [ffe32c4]
- Updated dependencies [e1f996b]
- Updated dependencies [6983478]
- Updated dependencies [fc36e15]
- Updated dependencies [524939e]
- Updated dependencies [405f06e]
- Updated dependencies [f50c829]
- Updated dependencies [b3a9191]
- Updated dependencies [dd24fd5]
- Updated dependencies [7042056]
- Updated dependencies [6983478]
- Updated dependencies [e031a7d]
- Updated dependencies [86ae0c5]
- Updated dependencies [a33cdd6]
- Updated dependencies [067efa3]
- Updated dependencies [fab1cb0]
- Updated dependencies [6983478]
- Updated dependencies [dd24fd5]
- Updated dependencies [149800c]
- Updated dependencies [6983478]
- Updated dependencies [cb9ad82]
- Updated dependencies [ea6352e]
- Updated dependencies [1987bd7]
- Updated dependencies [0c4d5a1]
- Updated dependencies [dd24fd5]
- Updated dependencies [fcac573]
- Updated dependencies [41aa22a]
- Updated dependencies [c842fb7]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [634fd52]
- Updated dependencies [149800c]
- Updated dependencies [aafaaa9]
- Updated dependencies [1987bd7]
- Updated dependencies [74cbff9]
- Updated dependencies [894d51c]
- Updated dependencies [0040cad]
- Updated dependencies [a3dce2f]
- Updated dependencies [3656e32]
- Updated dependencies [43d940d]
- Updated dependencies [a032c5c]
- Updated dependencies [7f8dbc0]
- Updated dependencies [c71d4f3]
- Updated dependencies [a3dce2f]
- Updated dependencies [c2f3f69]
- Updated dependencies [3656e32]
- Updated dependencies [1987bd7]
- Updated dependencies [f42e5b7]
- Updated dependencies [cc2bca1]
- Updated dependencies [6983478]
- Updated dependencies [1987bd7]
  - octane@0.1.2

## 0.1.1

### Patch Changes

- [#1](https://github.com/octanejs/octane/pull/1) [`dcdf237`](https://github.com/octanejs/octane/commit/dcdf2375ce3a8a2e00b1e1de04f65c2529fd287e) Thanks [@trueadm](https://github.com/trueadm)! - Rename the project from `vyre` to `octane`. The runtime now publishes as `octane` and the Vite metaframework plugin as `@octanejs/vite-plugin`. Identifiers inherited from the Ripple fork were also renamed to Octane (e.g. `setIsRippleActEnvironment` → `setIsOctaneActEnvironment`, the metaframework `ripple()` plugin → `octane()`, and the `ripple.config.ts` convention → `octane.config.ts`). References to the upstream Ripple framework and its `@ripple-ts`/`@tsrx` packages are unchanged.

- Updated dependencies [[`dcdf237`](https://github.com/octanejs/octane/commit/dcdf2375ce3a8a2e00b1e1de04f65c2529fd287e)]:
  - octane@0.1.1
