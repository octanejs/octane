# @octanejs/vite-plugin

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
- 43d940d: Exclude `@octanejs/query` from esbuild pre-bundling (optimizeDeps.exclude + ssr.noExternal). It ships a `.tsrx` provider component, so — like `octane` itself — its source must flow through the octane `.tsrx` transform rather than being pre-bundled by esbuild.
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
