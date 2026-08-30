# @octanejs/app-core

## 0.0.46

### Patch Changes

- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50

## 0.0.45

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

## 0.0.44

### Patch Changes

- 9dda682: Match static application routes without regular expressions and normalize each
  request method once per dispatch. Expose the accompanying router benchmark
  through the Octane MCP benchmark tool.
- Updated dependencies [3ca30fc]
- Updated dependencies [efdc8cb]
- Updated dependencies [922df8c]
- Updated dependencies [8a8afd8]
- Updated dependencies [37a8ca1]
- Updated dependencies [c84edbb]
- Updated dependencies [d5175ca]
- Updated dependencies [4a4996e]
  - octane@0.1.48

## 0.0.43

### Patch Changes

- 60581f4: Prepare and reuse normalized production HTML template fragments across SSR
  requests that do not set a CSP nonce, avoiding repeated hydration normalization
  and static-template validation on every render.
- 7a639fd: Reuse production render-route indices and lazily cached per-route asset tags instead of rebuilding them for every request.
- Updated dependencies [af0d999]
- Updated dependencies [c800a1f]
- Updated dependencies [c1bb057]
- Updated dependencies [97b9349]
- Updated dependencies [4393bea]
- Updated dependencies [7dfef16]
- Updated dependencies [7e62361]
- Updated dependencies [964783a]
- Updated dependencies [d3dbd78]
  - octane@0.1.47

## 0.0.42

### Patch Changes

- Updated dependencies [7e96f71]
- Updated dependencies [d7226ff]
  - octane@0.1.46

## 0.0.41

### Patch Changes

- Updated dependencies [5b1e6a3]
- Updated dependencies [31abee5]
- Updated dependencies [fd6ce69]
- Updated dependencies [5f7a457]
- Updated dependencies [5227d7b]
- Updated dependencies [6927595]
- Updated dependencies [f1a7802]
  - octane@0.1.45

## 0.0.40

### Patch Changes

- Updated dependencies [9b06e47]
- Updated dependencies [7535acd]
  - octane@0.1.44

## 0.0.39

### Patch Changes

- Updated dependencies [4b590bd]
- Updated dependencies [c0ff085]
- Updated dependencies [6a68a7d]
- Updated dependencies [6b97f85]
  - octane@0.1.43

## 0.0.38

### Patch Changes

- afa3722: Keep stylesheets for route layouts, root fallbacks, and their deferred Hydrate
  children available before client activation without eagerly preloading their
  JavaScript.
- Updated dependencies [1581e1b]
- Updated dependencies [afa3722]
- Updated dependencies [231e248]
- Updated dependencies [2f9b301]
- Updated dependencies [939c64d]
  - octane@0.1.42

## 0.0.37

### Patch Changes

- Updated dependencies [489a886]
- Updated dependencies [922b2d4]
- Updated dependencies [814a3c1]
  - octane@0.1.41

## 0.0.36

### Patch Changes

- Updated dependencies [ff9b859]
- Updated dependencies [14b8b40]
- Updated dependencies [cc6e5ea]
  - octane@0.1.40

## 0.0.35

### Patch Changes

- Updated dependencies [954028b]
- Updated dependencies [21f4dfb]
- Updated dependencies [1cb4a19]
- Updated dependencies [0fc84da]
  - octane@0.1.39

## 0.0.34

### Patch Changes

- Updated dependencies [0635af6]
  - octane@0.1.38

## 0.0.33

### Patch Changes

- Updated dependencies [954c75f]
- Updated dependencies [94fa199]
- Updated dependencies [c2e77a3]
- Updated dependencies [125c861]
- Updated dependencies [765134a]
- Updated dependencies [9efd6f4]
- Updated dependencies [603756a]
  - octane@0.1.37

## 0.0.32

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

## 0.0.31

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

## 0.0.30

### Patch Changes

- Updated dependencies [78316b4]
- Updated dependencies [4e53ef4]
- Updated dependencies [4cc7840]
- Updated dependencies [39b3e19]
- Updated dependencies [8c29020]
- Updated dependencies [97e65b9]
  - octane@0.1.34

## 0.0.29

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

## 0.0.28

### Patch Changes

- Updated dependencies [d453832]
- Updated dependencies [3152f0b]
- Updated dependencies [1c44117]
- Updated dependencies [cbd55ca]
- Updated dependencies [cdb501c]
  - octane@0.1.32

## 0.0.27

### Patch Changes

- Updated dependencies [80a9c7e]
- Updated dependencies [62d7f13]
- Updated dependencies [16df26e]
  - octane@0.1.31

## 0.0.26

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

## 0.0.25

### Patch Changes

- Updated dependencies [8fb7990]
  - octane@0.1.29

## 0.0.24

### Patch Changes

- Updated dependencies [2b98a33]
  - octane@0.1.28

## 0.0.23

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27

## 0.0.22

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26

## 0.0.21

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - octane@0.1.25

## 0.0.20

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24

## 0.0.19

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23

## 0.0.18

### Patch Changes

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22

## 0.0.17

### Patch Changes

- Updated dependencies [10efc28]
- Updated dependencies [39bfc49]
- Updated dependencies [4863b39]
- Updated dependencies [ef82ba3]
  - octane@0.1.21

## 0.0.16

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

- 0a0b813: Give `module server` functions access to the request they are serving, via
  `getRequestContext()` and `tryGetRequestContext()`.

  The RPC boundary built a full `Context` for every request and handed it to the
  middleware chain, but the request store it ran the handler inside carried only
  `origin` and `platform`. A server function could therefore not read the headers,
  cookies, or middleware `state` for its own request, so the identity of the caller
  had to arrive as an argument from the browser, which is exactly the value a
  mutation must not trust. Render routes already received middleware state through
  `RenderRouteProps.state`; server functions now have the equivalent.

  ```tsx
  module server {
  	import { getRequestContext } from '@octanejs/app-core';

  	export async function deletePost(id: string) {
  		const { state } = getRequestContext();
  		const user = state.get('user');
  		if (!user) throw new Error('Not signed in');
  		await db.posts.delete(id, user.id);
  	}
  }
  ```

  The returned `Context` is the same instance the middleware chain observed,
  including its `state` mutations. `context.request.body` is already consumed by
  the time a server function runs, since the boundary reads it under the configured
  size limit before dispatching, so `bodyUsed` is `true`; headers, cookies, and
  `url` are unaffected. `getRequestContext()` throws outside a request because that
  is a programmer error, and `tryGetRequestContext()` returns `null` for code that
  has to run in both places.

  The active async context is published on a `Symbol.for` global, matching the
  existing fetch coordinator, so the accessor resolves the live store even though a
  server function is loaded through a separate module graph in dev and through the
  server manifest in production. Dev and production share the one boundary, so both
  behave identically. This does not yet cover SSR render routes, which never enter
  the request async context.

- c151b71: Add optional Strong mode for clearer state and ref behavior. Enable it across an
  application with `compiler: { strong: true }`, in one module with `"use strong"`,
  or through the Vite, Rspack, and Rsbuild plugin options. Strong modules reject
  state updates during render, direct state updates while setting up an effect, and
  render-time writes to refs, with `useLinkedState` available for state that
  should follow another value.
- Updated dependencies [c6370b6]
- Updated dependencies [dd272ad]
- Updated dependencies [c151b71]
- Updated dependencies [66b51d8]
- Updated dependencies [a57c32a]
- Updated dependencies [e38a557]
- Updated dependencies [bd90e27]
- Updated dependencies [ae6811d]
- Updated dependencies [62d81b8]
  - octane@0.1.20

## 0.0.15

### Patch Changes

- Updated dependencies [9d5d642]
- Updated dependencies [f469b3f]
- Updated dependencies [ac2ae2f]
- Updated dependencies [3aada64]
  - octane@0.1.19

## 0.0.14

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

## 0.0.13

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

## 0.0.12

### Patch Changes

- Updated dependencies [85a1c6d]
- Updated dependencies [f4c97d8]
- Updated dependencies [f3543bf]
- Updated dependencies [dfa6d29]
- Updated dependencies [9fbf31a]
  - octane@0.1.16

## 0.0.11

### Patch Changes

- Updated dependencies [16dc385]
- Updated dependencies [7fa4075]
  - octane@0.1.15

## 0.0.10

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

## 0.0.9

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

## 0.0.8

### Patch Changes

- a88f9ea: Add a Cloudflare Workers adapter for full-stack Octane apps. Vite and Rsbuild
  can now emit a Worker-targeted server bundle and a streaming module Worker for
  Workers Static Assets, with Cloudflare bindings and execution context available
  through request-scoped middleware and server-route context.

  Initialize streaming SSR token entropy on the first render so module evaluation
  remains valid in runtimes that prohibit random generation in global scope.

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
  - octane@0.1.12

## 0.0.7

### Patch Changes

- 9d86d20: Add a DOM-free universal runtime entry, generic renderer validation contracts,
  an explicit host microtask scheduler option, and compile-only runtime/thread
  metadata for native universal integrations. Let Rspack integrations select a
  graph-local Octane runtime while keeping cache and module build metadata
  distinct across universal runtime specializations. Validate renderer-selected
  project `.ts` and `.js` helpers without changing which compiler owns their
  output, and keep nested renderer diagnostics scoped to their authored regions.
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

## 0.0.6

### Patch Changes

- d426046: Initialize deferred-hydration interaction capture before generated client
  entries begin asynchronous route loading, preserving input that arrives before
  `hydrateRoot()`.
- Updated dependencies [d426046]
- Updated dependencies [f511024]
  - octane@0.1.10

## 0.0.5

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

## 0.0.4

### Patch Changes

- f8e94f2: Improve server streaming and hydration conformance for Suspense errors, aborts,
  synchronous iterables and thenables, raw HTML/style safety, controlled fields,
  and mismatch recovery.

  Compose configured app root catch boundaries inside pending boundaries so route
  errors render the catch UI while suspensions continue to render the pending UI
  on both the server and client.

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
- 6cfb63d: Report browser-repaired HTML nesting with authored locations during development SSR, and collect module style-map CSS while rendering so server and hydrated layouts use the same styles.

  Negotiate streaming gzip in the built-in Node HTTP transport for eligible SSR and static text responses, including the `octane-preview` path.

- 01a20fb: Suppress the spurious Vite "dynamic import cannot be analyzed" warning emitted when the config loader imports the evaluated `octane.config` module from the cache directory. The import target is a runtime-emitted file that Vite can never analyze statically, so it is annotated with `/* @vite-ignore */`.
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
- Updated dependencies [d1bb5c3]
- Updated dependencies [9c21887]
- Updated dependencies [674f1a4]
- Updated dependencies [6ceab55]
- Updated dependencies [3445fa6]
- Updated dependencies [6cfb63d]
- Updated dependencies [c68562b]
- Updated dependencies [4de2b4f]
- Updated dependencies [6868005]
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

## 0.0.3

### Patch Changes

- Updated dependencies [eaacd17]
- Updated dependencies [93dcb81]
- Updated dependencies [6852df7]
- Updated dependencies [b00cd74]
- Updated dependencies [e9852d4]
  - octane@0.1.7

## 0.0.2

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
