# @octanejs/rsbuild-plugin

## 0.1.61

### Patch Changes

- Updated dependencies [8e16346]
- Updated dependencies [ceba949]
- Updated dependencies [0bb170c]
- Updated dependencies [50e18cc]
- Updated dependencies [e595a13]
- Updated dependencies [5722871]
- Updated dependencies [8a9969c]
- Updated dependencies [995aa9a]
- Updated dependencies [8996380]
- Updated dependencies [b8e55da]
- Updated dependencies [7e1793f]
- Updated dependencies [8855e2f]
- Updated dependencies [7023961]
  - octane@0.11.0
  - @octanejs/rspack-plugin@0.2.0
  - @octanejs/app-core@0.1.3

## 0.1.60

### Patch Changes

- 1d5832e: Honour `server.trustProxy` in the request URL. Behind a proxy that terminates
  TLS or rewrites `Host`, the Node bridge built every URL from `http://` and the
  `Host` header, so `Context.url` named a different origin than the browser's and
  same-origin checks rejected legitimate requests. With `server.trustProxy: true`,
  `nodeHandler`, the built-in server, `octane-preview`, and the Vite and Rsbuild
  dev servers take the scheme from the first `X-Forwarded-Proto` entry (`http` or
  `https` only) and the host from the first `X-Forwarded-Host` entry (a plain
  `host[:port]` only). A malformed value is ignored, and the path and query always
  come from the request. `nodeRequestToWebRequest` and `createNodeServer` accept
  the same `trustProxy` option. The default is unchanged.

  `server.trustProxy` must now be a boolean, so a string such as `'false'` read
  from an environment variable can no longer enable it.
- 95090b1: Keep a request path that starts with `//` on the request's own host. The Node
  bridge resolved the raw request target against the request origin, so a target
  such as `//evil.example/x` (or `/\evil.example/x`) became host `evil.example`
  and path `/x` in `Context.url`, and the Vite and Rsbuild dev servers routed it
  as `/x`. An origin-form target now keeps its whole path and query on the
  request origin (the `Host` header, or the trusted proxy's with
  `server.trustProxy`) in `nodeRequestToWebRequest`, the built-in static file
  layer, and both dev servers. An `http://` or `https://` absolute-form target
  still keeps its own origin. An absolute-form target with any other scheme, such
  as `ftp://`, becomes a path under the root instead of a foreign-scheme URL.
  `@octanejs/app-core/node` exports `nodeRequestUrl`, the URL the bridge gives a
  Node request.
- Updated dependencies [ed57b1e]
- Updated dependencies [8aeb6c0]
- Updated dependencies [6182678]
- Updated dependencies [3fb1bec]
- Updated dependencies [c15aa5a]
- Updated dependencies [5cad0fa]
- Updated dependencies [5041f00]
- Updated dependencies [f7980e0]
- Updated dependencies [97f1b8e]
- Updated dependencies [fb404c2]
- Updated dependencies [9bacb23]
- Updated dependencies [2f88235]
- Updated dependencies [8aeb6c0]
- Updated dependencies [b353f54]
- Updated dependencies [72cd60b]
- Updated dependencies [91079dd]
- Updated dependencies [393b75a]
- Updated dependencies [f50c128]
- Updated dependencies [ba46692]
- Updated dependencies [f69215f]
- Updated dependencies [9c84293]
- Updated dependencies [1d5832e]
- Updated dependencies [95090b1]
- Updated dependencies [e233e4a]
- Updated dependencies [087cd77]
- Updated dependencies [c3c0a3b]
- Updated dependencies [262926c]
- Updated dependencies [9dafaef]
- Updated dependencies [35c0d1b]
- Updated dependencies [21e0575]
- Updated dependencies [8b97478]
- Updated dependencies [ab9a043]
- Updated dependencies [32e4f3f]
- Updated dependencies [1de873c]
- Updated dependencies [7a92ad2]
- Updated dependencies [a2a0c41]
- Updated dependencies [e03350a]
- Updated dependencies [0d6ef67]
- Updated dependencies [c213e87]
- Updated dependencies [da6524e]
- Updated dependencies [ace4737]
- Updated dependencies [b77ab18]
- Updated dependencies [1744e83]
- Updated dependencies [023aa7d]
- Updated dependencies [82a5f31]
  - octane@0.10.0
  - @octanejs/app-core@0.1.2
  - @octanejs/rspack-plugin@0.1.58

## 0.1.59

### Patch Changes

- Updated dependencies [1aa7696]
- Updated dependencies [8e68622]
- Updated dependencies [c1a8faf]
- Updated dependencies [12c32ec]
- Updated dependencies [1066cf6]
- Updated dependencies [00f8304]
- Updated dependencies [00f8304]
- Updated dependencies [dfff293]
- Updated dependencies [00cb8a5]
- Updated dependencies [39006d3]
- Updated dependencies [16d6090]
- Updated dependencies [949894d]
- Updated dependencies [39cf382]
- Updated dependencies [6651f44]
- Updated dependencies [6651f44]
- Updated dependencies [425a32a]
- Updated dependencies [02e6726]
- Updated dependencies [414e192]
  - octane@0.9.0
  - @octanejs/app-core@0.1.1
  - @octanejs/rspack-plugin@0.1.57

## 0.1.58

### Patch Changes

- 53db436: `new RenderRoute({ …, hydrate: 'islands' })` serves a route's server-rendered shell with a renderer-free bootstrap: the shell's module, layout and the renderer never load, and only the page's independent `<Hydrate>` islands activate. The shell's CSS still ships. The Vite build fails if the shell needs client work (hooks, handlers, refs, controlled values, ordinary `<Hydrate>`, `@try`, signal reads, spreads, unchecked components or root boundaries) or if the bootstrap or `preHydrate` hook reaches the renderer. The Rsbuild integration rejects the option for now.
- Updated dependencies [fbf6e40]
- Updated dependencies [a50b846]
- Updated dependencies [9ef7385]
- Updated dependencies [6ea582e]
- Updated dependencies [52c9d33]
- Updated dependencies [8f8349b]
- Updated dependencies [f355acd]
- Updated dependencies [53db436]
- Updated dependencies [3ffd8cc]
- Updated dependencies [9350268]
- Updated dependencies [4212874]
- Updated dependencies [f03d812]
- Updated dependencies [3315f74]
- Updated dependencies [f5896c6]
- Updated dependencies [3770c1e]
- Updated dependencies [3994e1e]
- Updated dependencies [6f019c5]
- Updated dependencies [6c50c70]
- Updated dependencies [de31710]
- Updated dependencies [fbaf501]
- Updated dependencies [70ee6a3]
- Updated dependencies [ab2798e]
- Updated dependencies [95421bb]
- Updated dependencies [9168bf6]
- Updated dependencies [11a9da9]
- Updated dependencies [92495b9]
- Updated dependencies [bfed959]
- Updated dependencies [c016c2d]
- Updated dependencies [21c3bfe]
- Updated dependencies [320f9e3]
- Updated dependencies [da9b1e4]
- Updated dependencies [4ab33b6]
- Updated dependencies [8e90048]
- Updated dependencies [6bb20ac]
- Updated dependencies [6959fa0]
- Updated dependencies [105e0f0]
- Updated dependencies [0d91b93]
- Updated dependencies [7698907]
- Updated dependencies [3baa492]
- Updated dependencies [1fa3853]
- Updated dependencies [62e76bf]
- Updated dependencies [3e3749d]
- Updated dependencies [a1f136c]
- Updated dependencies [39f3e97]
- Updated dependencies [11aebc7]
- Updated dependencies [416882f]
- Updated dependencies [3ec43da]
- Updated dependencies [0b833bb]
- Updated dependencies [11aebc7]
- Updated dependencies [bc30a18]
- Updated dependencies [b319c16]
- Updated dependencies [53db436]
- Updated dependencies [bc6761f]
- Updated dependencies [950ef0b]
- Updated dependencies [f5644f7]
- Updated dependencies [5ef4f9a]
- Updated dependencies [18c1b77]
- Updated dependencies [2b69387]
- Updated dependencies [07cc1d2]
- Updated dependencies [3d0e5e2]
- Updated dependencies [f647cef]
- Updated dependencies [8e90048]
- Updated dependencies [d496796]
- Updated dependencies [fdf54fe]
- Updated dependencies [ce97a96]
- Updated dependencies [dc3e180]
- Updated dependencies [e219d88]
- Updated dependencies [ed188d7]
- Updated dependencies [afbad9f]
- Updated dependencies [09cf476]
- Updated dependencies [0887a68]
- Updated dependencies [b319c16]
- Updated dependencies [3514dc7]
- Updated dependencies [3f1a7b2]
- Updated dependencies [985a81e]
- Updated dependencies [cb71034]
- Updated dependencies [69b02f1]
- Updated dependencies [3041f5d]
- Updated dependencies [b58c783]
- Updated dependencies [02e4eb0]
- Updated dependencies [5f354d2]
- Updated dependencies [02e4eb0]
- Updated dependencies [ad203e9]
- Updated dependencies [5e586e2]
- Updated dependencies [cdc9b07]
- Updated dependencies [90c209e]
- Updated dependencies [f34be34]
- Updated dependencies [d5030cf]
- Updated dependencies [a9594d0]
- Updated dependencies [15c7b97]
- Updated dependencies [3971840]
- Updated dependencies [d930afb]
- Updated dependencies [d930afb]
- Updated dependencies [6615a19]
- Updated dependencies [791f12e]
- Updated dependencies [0a14c20]
- Updated dependencies [9aa6736]
- Updated dependencies [541ecdc]
- Updated dependencies [5ef4f9a]
- Updated dependencies [e93bb26]
- Updated dependencies [97618d7]
- Updated dependencies [b5277d1]
- Updated dependencies [5ef4f9a]
- Updated dependencies [648a8d2]
- Updated dependencies [63f07f5]
- Updated dependencies [1d33932]
- Updated dependencies [2b4b3fc]
- Updated dependencies [b98179f]
- Updated dependencies [2b69559]
- Updated dependencies [5ef4f9a]
- Updated dependencies [1c44df5]
- Updated dependencies [f151614]
- Updated dependencies [f151614]
- Updated dependencies [1c44df5]
- Updated dependencies [dc4800b]
- Updated dependencies [cda985b]
- Updated dependencies [b6a414a]
- Updated dependencies [09565b4]
- Updated dependencies [752028d]
- Updated dependencies [b6a414a]
- Updated dependencies [0339abc]
- Updated dependencies [e936a90]
- Updated dependencies [dc4800b]
- Updated dependencies [dc4800b]
- Updated dependencies [752028d]
- Updated dependencies [752028d]
- Updated dependencies [dc4800b]
- Updated dependencies [54ff59e]
- Updated dependencies [25017f3]
- Updated dependencies [c2fea71]
- Updated dependencies [5ef4f9a]
- Updated dependencies [27c2a12]
- Updated dependencies [b682c2b]
- Updated dependencies [56de31a]
- Updated dependencies [ad12525]
- Updated dependencies [85cb387]
- Updated dependencies [7422815]
- Updated dependencies [517b61d]
  - octane@0.8.0
  - @octanejs/app-core@0.1.0
  - @octanejs/rspack-plugin@0.1.56

## 0.1.57

### Patch Changes

- 8a1fa61: Abort failed streamed responses and end HEAD responses without draining the body.

  When a Web Response body failed after the Node transport had sent headers, the
  built-in server appended `Internal Server Error` to the partial body and
  completed the response normally. Clients saw a successful HTTP 200 with the
  wrong bytes. `sendWebResponse` now destroys the response instead, so the client
  sees an interrupted transfer. It then rejects with the body error, which the
  caller logs. If the body fails before any byte is sent, the sender removes the
  Web Response's headers. The server's 500 response then no longer carries the
  failed response's `Content-Encoding` or `Content-Length`, which previously made
  it undecodable or truncated. The built-in server, the generated `nodeHandler`,
  and the Vite and Rsbuild dev middlewares no longer write to a response whose
  headers were already sent. In Vite dev, this also stops a late body failure from
  leaving the request open.

  HEAD responses now end as soon as the status and headers are sent, and the
  unused body is cancelled so its producer is released. Previously the transport
  read the whole body, which Node discards for HEAD, before ending the response.
  A streaming SSR page or a long-lived stream could therefore hold a HEAD request
  open indefinitely.
- Updated dependencies [55c2c01]
- Updated dependencies [38a5443]
- Updated dependencies [0547835]
- Updated dependencies [877a7a4]
- Updated dependencies [68c094d]
- Updated dependencies [c1a86ce]
- Updated dependencies [63baf8c]
- Updated dependencies [489db93]
- Updated dependencies [687f584]
- Updated dependencies [1b8c949]
- Updated dependencies [04df7e9]
- Updated dependencies [4c1ca88]
- Updated dependencies [489b121]
- Updated dependencies [ce47fae]
- Updated dependencies [b2e4b9a]
- Updated dependencies [8de664c]
- Updated dependencies [5cc6b64]
- Updated dependencies [0f8cb49]
- Updated dependencies [7fa3a2d]
- Updated dependencies [aa6753b]
- Updated dependencies [ce11f82]
- Updated dependencies [bd21050]
- Updated dependencies [5575ff6]
- Updated dependencies [5f14459]
- Updated dependencies [9230292]
- Updated dependencies [e4974cc]
- Updated dependencies [19f07e0]
- Updated dependencies [ba95169]
- Updated dependencies [8a1fa61]
- Updated dependencies [8432cb8]
- Updated dependencies [898820a]
- Updated dependencies [25cc659]
- Updated dependencies [8fb96a0]
- Updated dependencies [699e363]
- Updated dependencies [84d2eaf]
- Updated dependencies [ca7d55d]
- Updated dependencies [5bc3af7]
- Updated dependencies [94ba1b6]
- Updated dependencies [03e7ba0]
- Updated dependencies [ddb655c]
- Updated dependencies [4ebe8d4]
- Updated dependencies [e325a83]
- Updated dependencies [d78f279]
- Updated dependencies [ddb655c]
- Updated dependencies [8fb96a0]
- Updated dependencies [d7ffa13]
- Updated dependencies [32c1bf4]
- Updated dependencies [7ee5f1a]
- Updated dependencies [608ff43]
- Updated dependencies [09c58dc]
- Updated dependencies [28a3636]
- Updated dependencies [3f9b16b]
- Updated dependencies [25b6e6d]
- Updated dependencies [9d322ef]
- Updated dependencies [4d8a93b]
- Updated dependencies [d455cb1]
- Updated dependencies [40f4827]
- Updated dependencies [4180828]
- Updated dependencies [c587109]
- Updated dependencies [ba483f4]
- Updated dependencies [c37f922]
- Updated dependencies [007691e]
  - octane@0.7.0
  - @octanejs/app-core@0.0.58
  - @octanejs/rspack-plugin@0.1.55

## 0.1.56

### Patch Changes

- Updated dependencies [4b235d2]
- Updated dependencies [411c555]
- Updated dependencies [ac2a217]
- Updated dependencies [6e86908]
- Updated dependencies [b9b0bc4]
- Updated dependencies [c3dda51]
  - octane@0.6.0
  - @octanejs/app-core@0.0.57
  - @octanejs/rspack-plugin@0.1.54

## 0.1.55

### Patch Changes

- Updated dependencies [3390f40]
- Updated dependencies [d285bd7]
- Updated dependencies [701b8c3]
- Updated dependencies [4f25786]
- Updated dependencies [afc0bee]
- Updated dependencies [752d750]
- Updated dependencies [2d46905]
- Updated dependencies [a95c2dc]
- Updated dependencies [fd81578]
- Updated dependencies [bdd7db7]
- Updated dependencies [47580bd]
  - octane@0.5.0
  - @octanejs/app-core@0.0.56
  - @octanejs/rspack-plugin@0.1.53

## 0.1.54

### Patch Changes

- 2554d85: Cancel Node request signals when clients disconnect after their upload completes, including while an async handler or streaming response is still running. The Node request helper accepts the corresponding response so custom hosts can preserve the same cancellation lifetime.
- Updated dependencies [2554d85]
  - @octanejs/app-core@0.0.55
  - @octanejs/rspack-plugin@0.1.52

## 0.1.53

### Patch Changes

- Updated dependencies [3a859dd]
- Updated dependencies [620769b]
- Updated dependencies [dbcabb2]
- Updated dependencies [92227f6]
- Updated dependencies [6580880]
- Updated dependencies [db35ac1]
- Updated dependencies [f209f7c]
- Updated dependencies [a2c3e07]
- Updated dependencies [a2c3e07]
- Updated dependencies [34e83ce]
  - octane@0.4.0
  - @octanejs/app-core@0.0.54
  - @octanejs/rspack-plugin@0.1.52

## 0.1.52

### Patch Changes

- Updated dependencies [5f4b258]
  - @octanejs/app-core@0.0.53
  - @octanejs/rspack-plugin@0.1.51

## 0.1.51

### Patch Changes

- Updated dependencies [debd7df]
- Updated dependencies [873f4d2]
- Updated dependencies [68a6690]
- Updated dependencies [c32e76b]
- Updated dependencies [a6d7f49]
- Updated dependencies [14fd908]
- Updated dependencies [893cc83]
  - octane@0.3.0
  - @octanejs/app-core@0.0.52
  - @octanejs/rspack-plugin@0.1.51

## 0.1.50

### Patch Changes

- 5ead1ff: Add owner-bound signal declarations, async derivations and keyed streams, direct native signal bindings, and independent hydration infrastructure. Add request-local server-call context, bounded streamed RPC, and explicitly batched independent reads. Preserve operation identity and cancellation boundaries across navigation and uncertain acknowledgements.

  Allow a later widget activation to retry a failed framework-loaded stylesheet
  without discarding queued interactions or revealing the widget before CSS loads.

  Support renderer-free global signal and streamed-state activation for hosts that
  retain server-owned HTML. Adopt initial document seeds before behavior reads,
  preserve early edits, bind native control properties without reconciliation, and
  let envelope owners emit the early capture script before interactive markup
  without duplicating it in rendered fragments.

  Catalog the new core runtime diagnostics while preserving their error classes,
  and verify the published streaming bootstrap subpath and inline script export.

  Keep individual and batched server calls on the page's origin when an authored
  base element points to another origin.

  Keep reusable DOM, CSS, and component prop types scalar while allowing direct
  signal bindings at native JSX sites, preserving existing binding consumers.
  Use scalar public props for Zag's state-machine normalization results and
  to-print's imperative iframe options.
- Updated dependencies [5ead1ff]
- Updated dependencies [5ead1ff]
  - @octanejs/app-core@0.0.51
  - @octanejs/rspack-plugin@0.1.50

## 0.1.49

### Patch Changes

- 02ecadb: Recognize locally proven primitive string, number, and bigint DOM children while preserving explicit `as string` text bindings. Add an optional TypeScript project proof for one-shot Vite, Rspack, and Rsbuild production builds, with matching server and hydration output.
- 2ffcc71: Promote scoped signals to a stable API. Detect signal capabilities automatically in the compiler and remove the experimental `nativeReads` build option. Signal handles and helpers keep their `$` naming convention; local hooks, inferred memos, async resources, and DOM SSR/hydration work through the standard toolchain. Add the signals website guide and llms.txt reference.
- Updated dependencies [02ecadb]
- Updated dependencies [2ffcc71]
  - @octanejs/rspack-plugin@0.1.49
  - @octanejs/app-core@0.0.50

## 0.1.48

### Patch Changes

- Updated dependencies [aec5373]
- Updated dependencies [1f19beb]
- Updated dependencies [ab7bbc1]
- Updated dependencies [56c850e]
  - @octanejs/app-core@0.0.49
  - @octanejs/rspack-plugin@0.1.48

## 0.1.47

### Patch Changes

- ddaa8c5: Promote Octane to beta and begin the 0.2 release line.
- Updated dependencies [ddaa8c5]
  - @octanejs/app-core@0.0.48
  - @octanejs/rspack-plugin@0.1.47

## 0.1.46

### Patch Changes

- Updated dependencies [9321d39]
- Updated dependencies [fdb711a]
- Updated dependencies [5e80135]
- Updated dependencies [ad499d0]
- Updated dependencies [892da9a]
- Updated dependencies [babf8d7]
- Updated dependencies [2785a2f]
- Updated dependencies [df82fbc]
- Updated dependencies [0824502]
- Updated dependencies [47c8f54]
  - octane@0.1.51
  - @octanejs/app-core@0.0.47
  - @octanejs/rspack-plugin@0.1.46

## 0.1.45

### Patch Changes

- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [e2ad89c]
- Updated dependencies [96c86fc]
  - octane@0.1.50
  - @octanejs/rspack-plugin@0.1.45
  - @octanejs/app-core@0.0.46

## 0.1.44

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
  - @octanejs/rspack-plugin@0.1.44

## 0.1.43

### Patch Changes

- 5a8f0d4: Skip allocation-heavy RPC owner masking for ordinary project modules.
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
  - @octanejs/rspack-plugin@0.1.43

## 0.1.42

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
  - @octanejs/rspack-plugin@0.1.42

## 0.1.41

### Patch Changes

- Updated dependencies [7e96f71]
- Updated dependencies [d7226ff]
  - octane@0.1.46
  - @octanejs/app-core@0.0.42
  - @octanejs/rspack-plugin@0.1.41

## 0.1.40

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
  - @octanejs/rspack-plugin@0.1.40

## 0.1.39

### Patch Changes

- Updated dependencies [9b06e47]
- Updated dependencies [7535acd]
  - octane@0.1.44
  - @octanejs/app-core@0.0.40
  - @octanejs/rspack-plugin@0.1.39

## 0.1.38

### Patch Changes

- 6b97f85: Add opt-in CSS-module constant folding to one-shot Rspack and Rsbuild production builds. Authenticate immutable JavaScript CSS exports from the actual module graph, preserve stylesheet ownership, and keep proof callbacks on the main thread when compiler workers are enabled. Native CSS modules and mutable default maps retain their existing behavior.
- Updated dependencies [4b590bd]
- Updated dependencies [c0ff085]
- Updated dependencies [6a68a7d]
- Updated dependencies [6b97f85]
- Updated dependencies [6fbde38]
  - octane@0.1.43
  - @octanejs/rspack-plugin@0.1.38
  - @octanejs/app-core@0.0.39

## 0.1.37

### Patch Changes

- Updated dependencies [1581e1b]
- Updated dependencies [afa3722]
- Updated dependencies [afa3722]
- Updated dependencies [231e248]
- Updated dependencies [2f9b301]
- Updated dependencies [939c64d]
  - octane@0.1.42
  - @octanejs/app-core@0.0.38
  - @octanejs/rspack-plugin@0.1.37

## 0.1.36

### Patch Changes

- Updated dependencies [489a886]
- Updated dependencies [922b2d4]
- Updated dependencies [814a3c1]
  - octane@0.1.41
  - @octanejs/app-core@0.0.37
  - @octanejs/rspack-plugin@0.1.36

## 0.1.35

### Patch Changes

- 9c00c34: Compile Octane modules in parallel Rspack loader workers by default while
  preserving compiler source maps, module layers, build metadata, diagnostics,
  and watched package manifests. Both integrations accept `parallel: false` to
  disable worker compilation or `parallel: { maxWorkers }` to configure the
  worker-pool limit.
- Updated dependencies [ff9b859]
- Updated dependencies [14b8b40]
- Updated dependencies [9c00c34]
- Updated dependencies [cc6e5ea]
  - octane@0.1.40
  - @octanejs/rspack-plugin@0.1.35
  - @octanejs/app-core@0.0.36

## 0.1.34

### Patch Changes

- Updated dependencies [954028b]
- Updated dependencies [21f4dfb]
- Updated dependencies [1cb4a19]
- Updated dependencies [0fc84da]
  - octane@0.1.39
  - @octanejs/app-core@0.0.35
  - @octanejs/rspack-plugin@0.1.34

## 0.1.33

### Patch Changes

- Updated dependencies [0635af6]
  - octane@0.1.38
  - @octanejs/app-core@0.0.34
  - @octanejs/rspack-plugin@0.1.33

## 0.1.32

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
  - @octanejs/rspack-plugin@0.1.32

## 0.1.31

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
  - @octanejs/rspack-plugin@0.1.31
  - @octanejs/app-core@0.0.32

## 0.1.30

### Patch Changes

- 2d06817: Preserve active IME composition and focus through controlled-input updates,
  keyed reorders, and deferred hydration; improve Samsung Internet and Android
  browser compatibility, scheduling, and browser build targets.
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
  - @octanejs/rspack-plugin@0.1.30

## 0.1.29

### Patch Changes

- Updated dependencies [78316b4]
- Updated dependencies [4e53ef4]
- Updated dependencies [4cc7840]
- Updated dependencies [39b3e19]
- Updated dependencies [8c29020]
- Updated dependencies [97e65b9]
  - octane@0.1.34
  - @octanejs/app-core@0.0.30
  - @octanejs/rspack-plugin@0.1.29

## 0.1.28

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
  - @octanejs/rspack-plugin@0.1.28

## 0.1.27

### Patch Changes

- Updated dependencies [d453832]
- Updated dependencies [3152f0b]
- Updated dependencies [1c44117]
- Updated dependencies [cbd55ca]
- Updated dependencies [cdb501c]
  - octane@0.1.32
  - @octanejs/app-core@0.0.28
  - @octanejs/rspack-plugin@0.1.27

## 0.1.26

### Patch Changes

- Updated dependencies [80a9c7e]
- Updated dependencies [62d7f13]
- Updated dependencies [16df26e]
  - octane@0.1.31
  - @octanejs/app-core@0.0.27
  - @octanejs/rspack-plugin@0.1.26

## 0.1.25

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
  - @octanejs/rspack-plugin@0.1.25

## 0.1.24

### Patch Changes

- Updated dependencies [8fb7990]
  - octane@0.1.29
  - @octanejs/app-core@0.0.25
  - @octanejs/rspack-plugin@0.1.24

## 0.1.23

### Patch Changes

- Updated dependencies [2b98a33]
  - octane@0.1.28
  - @octanejs/app-core@0.0.24
  - @octanejs/rspack-plugin@0.1.23

## 0.1.22

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27
  - @octanejs/app-core@0.0.23
  - @octanejs/rspack-plugin@0.1.22

## 0.1.21

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26
  - @octanejs/app-core@0.0.22
  - @octanejs/rspack-plugin@0.1.21

## 0.1.20

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
  - @octanejs/rspack-plugin@0.1.20

## 0.1.19

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24
  - @octanejs/app-core@0.0.20
  - @octanejs/rspack-plugin@0.1.19

## 0.1.18

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23
  - @octanejs/app-core@0.0.19
  - @octanejs/rspack-plugin@0.1.18

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
