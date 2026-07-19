# octane

## 0.1.10

### Patch Changes

- d426046: Make client imports tree-shakeable and defer browser setup until the relevant
  feature is first used. Compiled DOM templates now parse on first mount,
  post-paint scheduling creates its channel on demand, and unused generated
  component initializers can be removed. Add `initializeHydrationEventCapture()`
  for applications that await work before `hydrateRoot()` so deferred interaction
  intent remains replayable without import-time listeners.
- f511024: Streaming SSR: add `StreamOptions.injection` (`StreamInjectionSource`) — merge a live stream of externally-produced HTML (e.g. a framework's data `<script>` tags) natively into `renderToPipeableStream` / `renderToReadableStream` output. Injected HTML is emitted verbatim, in push order, each drain as its own chunk strictly between tag-complete renderer chunks — never before the shell; for document renders the `</body></html>` tail is held and written last, and the stream closes only once rendering is complete and the source's `done` promise settles. Without the option, streamed output is unchanged.

## 0.1.9

### Patch Changes

- c704664: A synchronous commit during a controlled checkable's click dispatch (a handler
  calling `flushSync` — press-state machinery does this) no longer reasserts the
  stale controlled `checked` over the user's in-flight toggle. The platform
  toggles a checkbox/radio before its click event and fires `input`/`change`
  after it; reasserting in between reverted the toggle before any native handler
  could read it. During that activation window the `checked` binding now uses
  React's prop-diff semantics (an unchanged prop leaves the DOM drift for the
  event-side restore; a prop that actually changed still writes), matching
  React's observable behavior. The window covers the activated element and its
  radio-group cousins: the platform unchecked the cousin as part of the same
  toggle, and re-checking it mid-window would make the browser uncheck the
  activated radio before its follow-up events fire. The rejection contract is
  unchanged: an unheard or rejected toggle still snaps back after the follow-up
  events.

  Nested or canceled programmatic activations now close their window at the end
  of their own click dispatch. Checked and radio restoration is also installed as
  an optional runtime capability, so apps without controlled `checked` bindings
  do not retain the radio-group restoration code.

- 5b7d9ed: Discard a root's partially rendered tree when an uncaught initial render fails, preventing aborted effects from leaking into a later flush while keeping the root available for a recovery render.
- 5b7d9ed: Make the direct Vite compiler integration discover raw Octane dependencies from the nearest parent package manifest when Vite uses a nested root, and publish first-party types for `octane/compiler/vite`.
- 91b5f45: Infer omitted dependency arrays for locally declared custom hooks in
  full-compiled `.tsrx`/`.tsx` modules that transparently forward their callback
  and final dependency parameter to a supported hook.
- c16778a: Fix children loss when a value-position host descriptor changes its tag: the
  de-opt renderer recreated the element but preserved the children slot, whose
  markers and content lived inside the removed element, so children-block
  children (e.g. a styled-components-style `createElement(props.tag, { children })`)
  kept rendering into the detached node. The recreate path now tears the slot
  down so children remount into the fresh element, matching React's remount
  semantics for a host tag change.
- 39f2c00: Fix TSRX shorthand components that return before reaching their trailing
  template. Early values, bare or undefined returns, and trailing compiled JSX now
  reconcile through one returned-output path across client rendering and
  hydration; folded control-flow cache dependencies stay scoped correctly, and
  incompatible HMR edits safely invalidate the module.

  Restore feature-level tree shaking for ordinary component boundaries. Built-in
  boundary behavior now travels through component capability flags, so rendering a
  normal component no longer retains unused Hydrate, Suspense, or ViewTransition
  implementations through direct identity checks. Deferred-hydration setup and
  ViewTransition scheduler integration now install through retained feature
  capabilities, allowing their concrete runtime graphs to disappear from clients
  that do not use those APIs.

- aabf79c: Reduce production framework payloads by keeping transition swaps, generic
  component returns, and generic attribute routing out of bundles that do not use
  them. Production compilation now preserves void-component proofs across local
  module imports, lowers null-only component guards and statically authored error
  boundaries, and emits narrow boolean/ARIA attribute writers when their full
  semantics are known at compile time.
- 07511e4: Keep `onChange` native while adding compile-time and development-runtime text-host
  diagnostics, explicit commit intent, and correct controlled checkbox/radio
  restoration through native change. Use native `input` events for Base UI text
  controls while preserving the number field's form-facing native change commit,
  propagate authored-source diagnostics through MDX compilation and Vite, and make
  Octane's bridge tooling target React-style text-host event wiring without rewriting
  component callbacks or non-text controls.
- 5b7d9ed: Compile template directives nested directly inside other directive bodies, including conditional keyed lists whose items own `@try` boundaries, in both client and server builds.
- 0d2e265: Expose generic hydration ownership markers for externally serialized thenables and nested hydration containers, and preserve leading `#` package-import aliases in bundler module IDs.
- 3168360: Fixed compiling TypeScript modules that place multiple paired JSX elements on the same line in an array literal, including arrays inside JSX expression children.
- 81c8842: Keep scoped-style hashes stable across Hydrate splitting and renderer-boundary lowering: the compiler now restamps every scoped `<style>` with its authored-position hash after a source rewrite, so client and server compiles of one module always agree on the emitted scope classes instead of hydration-mismatching every element after a split boundary. A scoped `<style>` authored directly inside split Hydrate children is now a compile error (`OCTANE_HYDRATE_SPLIT_STYLE`) because extraction would tear the owning component's single style scope in half; move the style outside the boundary, into a child component, or opt out with `split={false}`.

## 0.1.8

### Patch Changes

- 156f213: Preserve explicit/spread class precedence across SSR and hydration, and keep generated keyed-list helpers outside destructured component parameters.
- 2a5f44f: Add compiler-backed deferred hydration with the `Hydrate` component, hydration
  strategies, split-child loading and prefetching, SSR adoption, nested interaction
  replay, and eager CSS retention for deferred chunks in the Vite and Rsbuild app
  integrations.
- f8e94f2: Improve server streaming and hydration conformance for Suspense errors, aborts,
  synchronous iterables and thenables, raw HTML/style safety, controlled fields,
  and mismatch recovery.

  Compose configured app root catch boundaries inside pending boundaries so route
  errors render the catch UI while suspensions continue to render the pending UI
  on both the server and client.

- a12a3d9: Add the experimental universal renderer foundation: a bundler-neutral registry and filename resolver, static host-plan compiler target, core-owned logical topology and staged transactions, object test driver, and explicit DOM-to-universal boundary.
- 1b21731: Refresh suspended boundaries when newer props supersede their pending promise,
  while keeping fallback-visible, fully staged transition groups together through
  their DOM, ref, and layout-effect commit.
- 7a123d2: Preserve Lexical node identity during cold Vite dependency discovery by expanding raw binding package prebundle family rules across the binding and app dependency manifests, including the complete declared `@lexical/*` module family.
- 95b3081: Complete the experimental universal client renderer's core composition
  semantics: nested component owners, template directives and spreads,
  transactional renderer events, and statically declared renderer-owned child
  regions in both DOM-to-universal and universal-to-DOM directions. Normalize
  and forward boundary metadata consistently across direct compilation, Vite,
  Rspack, and Rsbuild while preserving authored source maps and normal universal
  HMR, profiling, and parallel-use planning. Add the experimental boundary
  configuration schema and the reverse DOM owner bridge used by compiled child
  regions.
- 38d95eb: The compiler no longer claims a call as an octane builtin hook when its name is
  bound by an import from another module. A library hook whose name collides with
  a base hook (`useId` from a React-parity binding like `@octanejs/aria`,
  `useState`-alikes, …) previously had the octane builtin's runtime import
  injected over it — a duplicate-identifier parse error in the compiled module,
  and the wrong function at the call site. Non-octane import bindings now shadow
  the builtin spelling everywhere the bare-name classification applies (hook
  slotting, the JS-loop guard, and the `useState` third-tuple getter analysis);
  such calls take the custom-hook path with the standard trailing call-site slot.
- ba36091: Match React's `useEffectEvent` semantics with fresh per-render wrappers and
  commit-time, abort-safe callback publication. Block untrusted `javascript:` URL
  attributes consistently across client rendering, hydration, SSR, streaming, and
  resource hints.
- 6ccdbce: Let controlled selects preserve a browser choice across the native input/change event pair so `onChange` observes the selected value, and keep capture/bubble handlers in one discrete update window so capture work cannot restore the old choice before bubbling.
- d1bb5c3: Align root lifecycle, Fragment and iterable reconciliation, element and Children APIs, and lazy function-component resolution with the pinned React 19 conformance cases. Class components, legacy roots, `forwardRef`, and other unsupported React-only surfaces remain explicit non-goals.
- 9c21887: Add `octane/react` (experimental): host a compiled Octane subtree inside a real
  React 19 tree through one component — `<OctaneCompat><Island …/></OctaneCompat>`.
  React owns the wrapper and one host element; a private hosted Octane root owns
  every descendant through the existing renderer-region owner bridge. Local Octane
  `@try`/Suspense/error boundaries win first; only an unhandled island suspension
  or error escapes to the nearest React Suspense/error boundary (React reveals
  only after the Octane retry has committed). Events stay native and delegated at
  the island host, the child `ref` passes through as an ordinary Octane ref prop,
  unchanged parent re-renders skip the island update, and StrictMode probes and
  Suspense hide/reveal preserve the hosted root while real unmounts dispose it
  exactly once. React and ReactDOM 19 are optional peer dependencies; the entry
  carries `'use client'`. Not yet included (see
  docs/react-hosted-octane-compat-plan.md): transparent React context, island
  SSR/hydration, and selective per-island event delegation.
- 674f1a4: `octane/react` islands now server-render and hydrate. The new
  `octane/react/server` entry runs one synchronous hosted Octane pass per React
  server render (Fizz streaming or `renderToString`) against a request-local
  session, so Fizz retries replay settled work instead of re-fetching — one
  replay per suspension stratum, parallel `use()` fetches started once, and
  rejections routed to Fizz exactly once. Island React-context reads call
  `React.use` directly on the server; locally-guarded suspensions ship their
  `@pending` arms in the shell for the client to complete; scoped island CSS
  hoists as deduplicated React 19 style resources that client hydration
  recognizes; and hoisted `<title>/<meta>/<link>` from islands is rejected with
  a targeted diagnostic. On the client, `OctaneCompat` hydrates a
  server-rendered host in place: Octane adopts the exact server node identities
  (byte-identical `useId` values, preserved state, live events) while React
  never touches the island's descendants. Also closes the escape-protocol
  matrix: island layout/passive/ref faults surface in the nearest React error
  boundary, and update suspensions over committed content preserve hidden
  island DOM and state (transition-originated episodes refallback in v1 — a
  documented divergence).
- 6ceab55: `octane/react` islands now read REAL React 19 contexts transparently: an
  island's ordinary `use()`/`useContext()` accepts a `React.Context<T>` object
  (typed via a structural overload that keeps React types out of the core
  package), resolves it through the owner bridge to a root-local mirror,
  bootstraps the committed nearest-provider value from the host Fiber once, and
  stays live by subscribing through real `React.use(context)` reads in the
  wrapper — provider-only updates flow through memoized parents with zero
  post-subscription Fiber walks, `memo()` consumers inside the island are
  invalidated correctly, and islands never observe each other's providers. When
  Fiber inspection is unavailable (or a providerless read needs the context
  default), a request handshake retries with the authoritative React value
  before paint. Reading a React context outside a hosted island now throws a
  targeted diagnostic, and `useContext()` rejects non-context arguments instead
  of silently returning `undefined`.
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

- c68562b: Error boundaries no longer corrupt the DOM when a @catch arm rethrows mid-render: the rethrown error now unwinds the live render stack before the outer boundary switches arms (previously the outer switch swept insertion anchors out from under still-mounting frames, producing an insertBefore NotFoundError that replaced the original error and could blank the page). During hydration, a client-built @catch arm also discards the slot's leftover server DOM, parks the adoption cursor past the slot, and renders with adoption suspended, so sibling content keeps hydrating cleanly instead of mis-adopting.
- 4de2b4f: Automatically reuse conservative pure TSRX component regions and keyed lists by inferred dependencies in production client builds, preserving context propagation and child-owned state. Always on in production compilation; dev/HMR/profiling/server builds keep normal reconciliation.
- 6868005: Add a renderer-infrastructure synchronous drain for universal hook and HMR
  updates. Add direct `HTMLCanvasElement` and `OffscreenCanvas` lifecycle support,
  composed Octane `act` and `flushSync` exports, callback-aware root unmounting,
  WebGL context recovery, controlled WebXR animation-loop ownership, precise
  universal HMR reconstruction, and the explicit-target low-level `DOMRegion`
  boundary.
- 1b21731: Render and hydrate template-only constructs nested in React-style returned JSX, including directives, Activity, Fragment refs, head singletons, and child code blocks. Preserve ordinary keyed Fragment descriptor boundaries across server rendering and hydration.

  Keep document-head hoisting namespace-aware across opaque component children so SVG titles remain inside the SVG selected by the component.

- 1b21731: Observe client-created thenables adopted from SSR suspense seeds so a later
  rejection cannot escape as an unhandled browser error during hydration.
- 1b21731: Apply component-scoped style blocks to React-style returned JSX, and keep
  multiple style blocks under one canonical scope across client rendering, SSR,
  and hydration.
- 7efdbdd: Harden server rendering and hydration parity for React-style Usable nodes, parser-sensitive streamed Suspense content, readiness callbacks, safe dynamic inline scripts, deep component trees, render-phase hook replay reached through user getters, root structural mismatch recovery and later updates, controlled form properties rebuilt during hydration, and suspended streamed boundaries that converge to one client arm without retaining abandoned registrations.
- 314b38d: Complete the React server-integration conformance matrix. Align client, SSR,
  streaming, hydration, and production compilation for attribute coercion,
  parser-normalized content, raw HTML, invalid children and element types,
  controlled native form fields, render-phase reducers, stable server hook replay,
  and React 19 callable Context providers. Resolve direct and spread host props
  from their final JSX source order, including aliases, duplicate writers,
  prop-driven children, void-element validation, and single-evaluation getters.
- dcd2707: Bound recursive effect setup/cleanup, ref, root-render, and external-store update chains with recoverable maximum-depth errors while preserving finite chains and wide independent batches. Keep `act()` scopes balanced when a synchronous drain rejects, report cross-component render updates in development, and preserve the implicit bailout when a compiled component returns unchanged `children`.
- d63b0d0: Extend the experimental universal renderer SDK with prepared host acceptance,
  stable-ID recreation, lifecycle and local callbacks, scoped events, prop
  codecs/resource handles, typed text and intrinsic metadata, and retained
  Activity/Suspense visibility. Add client-only renderer server stubs, omitted
  boundary regions, live-use diagnostics, and stable cross-adapter client
  reference manifests for DOM-shell hydration.
- 39e779c: Parallelize independent `use()` reads inside imported plain-TypeScript custom hooks and activate compiled warm plans across adjacent async component branches. Warm-cache entries now keep repeated component occurrences distinct and prevent speculative requests from restarting after adoption on later dependency waves.
- 1b21731: Preserve SVG, MathML, and foreignObject child namespaces across component templates, de-opt descriptor reconciliation, server rendering, hydration, and streamed reveals.
- f07c628: Add the R3F-compatible `useLoader` cache, preload/clear helpers, retained Three
  Suspense and Activity behavior, real browser asset loading, and client
  pending/error projection through `Canvas`. Preserve universal host roots while
  their DOM owner is hidden and allow updated hidden Suspense content to retry
  without waiting for an obsolete promise.
- fac1c66: Add asynchronous acknowledgement semantics to the experimental universal
  renderer transport and complete the Three technical preview with verified
  package exports, supported Three-version lanes, real WebGL failure recovery,
  and renderer performance baselines. Compiler-proven keyed intrinsic leaf loops
  now use an opt-in compact universal transaction, while the Three driver stages
  and applies canonical retained mesh batches without cloning the full host tree.
  The production-browser 1,000-mesh stability run now measures mount at 0.98x and
  retained updates at 1.03x R3F, replacing the previous 3.66x and 15.55x gaps.
- dbbcee1: Make Suspense waterfall elimination unconditional across the compiler and its
  bundler integrations. Remove the `parallelUse` configuration flag so compiled
  builds always run the conservative memoization, batched-unwrap, and eligible
  descendant-warming analysis. The rspack plugin rejects the removed option
  loudly; the vite plugin warns once that a passed `parallelUse` is ignored, so
  the timing change is never silent on upgrade.
- 5287eac: Add transactional universal portal target handles and R3F-compatible Three portals with state enclaves, shared frame and event integration, physical Object3D bubbling, validation, and ownership-safe teardown.

## 0.1.7

### Patch Changes

- eaacd17: Add opt-in client profiling builds across Vite, Rspack, Rsbuild, and MDX, with component timings, render causes, Chrome custom tracks, and a bounded console and trace API.
- 93dcb81: Reduce server-rendered `@for` overhead by accumulating item HTML directly, omitting per-item hydration markers for proven direct-host rows, and skipping keyed async-identity bookkeeping for compiler-proven synchronous items.
- 6852df7: Reduce production output size with compact numeric base-hook slots and collision-free ranges for composable custom hooks, mount-only event-callback sinking, and tree-shakable hydration capabilities.

  Production builds now prove direct imported TSRX roots and component bodies are void before selecting lean return-free render paths. Conditional string holes, statically named string `data-*` attributes, and statically safe uncontrolled `defaultValue` and checkbox/radio `checked` bindings also use smaller helpers, while ambiguous imports, spreads, dynamic return values, HMR, and profiling retain the generic behavior.

- b00cd74: Skip the full-response View Transition candidate scan for SSR passes that did not render a View Transition.
- e9852d4: Support server rendering and hydration for React-compatible `<Activity>` boundaries, including omitted hidden content and preserved offscreen client state.

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

- 85e589e: Reduce client DOM bookkeeping for anchored lists, inactive conditionals,
  `@empty` bodies, and compiler-proven single-root component or conditional keyed
  items while preserving the existing SSR and hydration range protocol.
- 2979f42: Reduce hydrated DOM bookkeeping by coalescing exactly coextensive range pairs
  into counted comments while preserving independent ownership boundaries.
- b41a91a: Add a bundler-neutral Octane compiler and app core, a low-level Rspack 2
  compiler integration, and a full Rsbuild 2 metaframework plugin with routing,
  streaming SSR, hydration, HMR, production client/server builds, preview, and
  adapter support. Keep the existing Vite integration on the same shared core.
- e55f6ed: Add complete modern dnd-kit bindings with sortable, sensor, overlay, SSR, hydration,
  and React differential coverage. Preserve nested empty component ranges during
  hydration so later updates can fill and clear them without mutating server markup.
- d173805: Preserve compiler-driven state-hook getters on client and server while keeping
  getter-free calls on the existing two-item path, including bounded server
  render-phase updates and immediate getter reads. Isolate `useId` by root with
  working identifier prefixes. Harden first-reveal ViewTransitions and compiler
  hook discovery for aliases, namespaces, dependency inference, and plain-loop
  errors.

  Consume Octane as an exact singleton peer from every framework binding and
  publish a Node 22 minimum engine requirement across core and the bindings.
  Compile installed raw-source binding graphs through Vite while preserving
  manifest-declared manual hook-slot directories.

- 813fd50: Fix `<ViewTransition>` commits started from native discrete event handlers so transition-only work reaches `document.startViewTransition`, including work queued while an animation is already active. Use the broadly supported callback overload of the browser API, and correctly skip asynchronous native transitions when a commit activates no boundary.

## 0.1.5

### Patch Changes

- 940ae5a: Add compiler-driven third-tuple current-state getters to `useState` and
  `useReducer`. Getter-free destructures retain the existing runtime path, while
  observed or escaped tuples receive a stable thunk that reads the latest state.
- 6fceaf3: Infer dependencies for effect-family hooks, `useMemo`, `useCallback`, and
  `useImperativeHandle` when their dependency list is omitted. Explicit arrays
  retain React semantics, while `null` opts into running or recomputing after
  every render.
- 62da8cc: Fix: a compiled `{expr}` child hole skipped its update entirely when the value was identity-unchanged, which stranded context consumers below an identity-stable `{children}` passthrough under a re-rendering Provider (e.g. a router forwarding stable children through location providers on every navigation). Unchanged renderables (objects/functions) now still dispatch to childSlot — whose bail path lazily refreshes changed-context consumers — while unchanged primitives keep the inline skip.
- e737057: Propagate non-bubbling toggle, dialog, media, and resource events through logical
  ancestors, matching React while preserving native Event objects.

## 0.1.4

### Patch Changes

- 05fdef8: React-parity attribute aliases: the canonical camelCase JSX props now write the attribute the browser actually parses — `strokeWidth` → `stroke-width`, `acceptCharset` → `accept-charset`, `xlinkHref` → `xlink:href` (React 19's `aliases` table, plus the namespaced xlink/xml props) — on the client (dynamic bindings, spreads, de-opt props), the SSR serializer, and compiled static attributes. Matters most on SVG hosts, whose `setAttribute` preserves case: an unaliased `strokeWidth` landed verbatim as a dead attribute and never styled the element. Additive — native hyphenated spellings still write verbatim; custom elements keep raw names.
- e9ebfbf: Publish build: entry points are now globbed from `src/` instead of hand-listed — the hand-maintained list had silently drifted (css.ts, server/rpc.ts, static/index.ts were missing, so `dist/runtime.js`, `octane/server`, and `octane/static` shipped with unresolvable relative imports). A new post-build guard (`scripts/verify-dist.mjs`, also run in CI) makes the class of bug impossible to ship: every emitted dist module's relative imports must resolve (including the verbatim-copied `dist/compiler/`), every `publishConfig` export target must exist, and every published entry point must import cleanly in plain Node — otherwise the build fails.
- 4ac4c98: Runtime: dev-only diagnostics are now gated behind `process.env.NODE_ENV !== 'production'` so bundlers strip them from production builds — hydration-mismatch warnings, controlled-input/select dev warnings (flip, missing-onInput, select value shape), the `act()` environment warning, DOM-prop hints (autofocus/defaultvalue casing, non-boolean attributes, lowercase `on*` handlers, object attribute stringification), the unkeyed-array-child warning, and the `use()` waterfall/uncached-promise hints. Behavior in dev and tests is unchanged (the token folds only under a bundler define); the framework chunk of a production app build shrinks ~7% gzip.
- c2129eb: Controlled form components — React-parity `value`/`checked` semantics on native events. `value`/`checked` on `<input>`/`<textarea>`/`<select>` now follow React's controlled model exactly: the prop drives the DOM property and reasserts on every commit and after discrete events (rejected edits snap back), IME composition is respected, radio groups restore as a group, `<select value>` projects options (single + multiple; no match → first non-disabled), and number inputs use React's loose compare. `defaultValue`/`defaultChecked` are the uncontrolled escape hatch. Hydration adopts pre-hydration user input (React parity), then the first commit/discrete event reasserts. Events stay 100% native — there is no synthetic `onChange`: `onInput` is the per-keystroke handler for text controls (native `change` fires on blur), and a dev warning flags a controlled text control with no `onInput` (special-cased when only `onChange` is present). `<textarea>` with both children and a `value`/`defaultValue` prop is now a compile error (the prop owns the content).

  **BREAKING:** apps that relied on a dynamic `value=`/`checked=` binding being a write-once attribute (set it, then let the user's edits win) now get React's controlled behavior — the prop reasserts and rejected edits snap back. Migrate those inputs to `defaultValue`/`defaultChecked`.

  Also ships the attribute-layer React-parity fixes: boolean attribute props (disabled, hidden, inert, readOnly, required, …) normalize — any truthy value renders the canonical `attr=""`, falsy removes — via the shared `BOOLEAN_ATTR_PROPS` table on client, SSR, and static compiles; booleans on non-boolean attributes are removed + dev-warn (`title={true}` no longer renders `title=""`), with `download`/`capture` keeping React's overloaded-boolean semantics; `muted`/`multiple`/`selected` dynamic writes set the DOM property (a dynamic `muted={x}` actually mutes); `autoFocus` writes no attribute and instead focuses the element in the commit phase of its mount; attribute-name validation is a proactive dev-warned skip (`VALID_ATTR_NAME`) instead of try/catch + prod console.error; new dev-only diagnostics for `[object Object]` coercion and the genuinely-broken casings (`autofocus`, `defaultvalue`, `defaultchecked`, lowercase `on*` function props). New tier-2 runtime exports (`setValue`, `setChecked`, `setSelectValue`, `setDefaultValue`, `setDefaultChecked`, `setAutoFocus`) and server helpers (`ssrValueAttr`, `ssrCheckedAttr`, `ssrTextareaValue`, `ssrSelectScope`, `ssrOption`).

- 4ac4c98: Marker elision M1 (docs/comment-marker-elision-plan.md): components whose body provably renders one plain element now carry a compiler-emitted `$$singleRoot` stamp on their exported binding, and call sites whose callee is an IMPORTED identifier (stable identity — local variable callees are excluded) pass a sentinel so `componentSlot` takes the existing markerless singleRoot mount path cross-module. Client-mount comment pairs drop for qualifying components; SSR output and hydration adoption are unchanged (same contract as forBlock's singleRoot items). Pinned by the marker-shape structural tests.
- 8a44bb5: React 19 custom-element listener semantics: a function-valued lowercase `on*` prop on a custom element (`<my-el oncustomevent={fn}>`) now attaches a real event listener for the name after `on` (verbatim), with identity swaps re-attaching and null detaching — and the function never lands in the markup. This is platform-aligned, not synthetic emulation: custom elements dispatch arbitrary events and this is the only declarative way to hear them. The property-vs-attribute heuristic remains intentionally unsupported (plain attributes, per octane's pass-through policy).
- 6b0c244: Marker elision M4: two client-mount elisions for descriptor-heavy trees (charts, de-opt lists). A `{expr}` hole that is its element's SOLE child now hands the element to an owns-parent childSlot — component/element values render with no anchor comment at all (previously one comment per hole). And pure single-element items in de-opt keyed lists (value-position `.map()` arrays) now self-mark — the rendered element is the item's own range marker, eliding the per-item `<!--it-->` pair; component-bearing, null, and primitive items keep their pair, and an item whose value later stops fitting one element promotes to a minted pair in place (one-way). SSR output and hydration adoption are unchanged; a recharts-style page drops roughly a sixth of its total comment nodes on top of M2/M3.
- d3cf678: Marker elision M2: de-opt host elements (descriptor-tree children, `.ts` `createElement` hosts) hand their content to a single owns-parent childSlot — no comment markers minted at all (inserts append, clears sweep the element), and component-bearing de-opt list items borrow their own `<!--it-->` pair instead of nesting a second one. Deep descriptor trees (e.g. charts) render with a fraction of the comment nodes; SSR output is unchanged.
- 05fdef8: Fixed a commit-phase crash ("Failed to execute 'removeChild' on 'Node'…") when a route swap or conditional removes the focused element: Chrome fires `blur`/`focusout` synchronously inside `removeChild`, and blur is a discrete event, so the end-of-dispatch flush re-entered the scheduler mid-commit — draining queued renders and effects while the outer removal walk held cached sibling pointers. A flush now tracks that it is on the stack (`inFlush`); a `flushSync` landing during it (including the internal discrete-event flush) runs its callback and defers the drain to the ambient flush, matching React's "cannot flush when already rendering" rule. `flushSync` nested inside another `flushSync`'s _callback_ still flushes inline.
- d19d4f3: The DOM truth tables (boolean/must-use-property attributes, attribute aliases, SVG-only tag classification, unitless style props, void elements, style-value coercion, style-key hyphenation) now live in one shared module (`src/dom-tables.js`) imported by the compiler, `octane/constants`, and both runtimes, instead of hand-duplicated per consumer — table drift between static bakes and dynamic writes is now structurally impossible. One real divergence this fixed: statically-baked style objects now trim string values (`{color: ' red '}` → `color: red`) exactly like dynamic/SSR writes, so the same style object can no longer produce different bytes depending on whether the compiler could bake it.
- 7e84258: React-parity effect commit + deletion ordering — the last two `useInsertionEffect` parity gaps. The commit now mirrors React's per-fiber mutation walk (`commitMutationEffectsOnFiber`): per component in tree post-order, destroy ALL of its insertion effects, create ALL of them, then destroy its layout effects — so a sibling's layout cleanups land before a later sibling's insertion work, and insertion destroy/create pairs group per component (matters to CSS-in-JS style recycling); layout bodies still run afterwards in the layout phase, after ref attach. Unmount is now phase-correct too (`commitDeletionEffectsOnFiber`): a deleted component's insertion + layout cleanups fire synchronously in hook DECLARATION order (React's forward effect-list walk — previously one reverse-registration unwind), and passive (`useEffect`) cleanups are DEFERRED to the passive flush (React's `commitPassiveUnmountEffects`) instead of running synchronously at unmount, with errors still routed to the try boundary enclosing the deletion.

  **Observable change:** `useEffect` cleanups no longer run synchronously during unmount — they fire in the next passive flush (post-paint, or `drainPassiveEffects()`/`act()` in tests). `@octanejs/testing-library`'s `unmount()`/`cleanup()` flush them for you (RTL's act-wrapped contract).

- 2f8c6ed: Compiled output 3b: `() => fn(arg, …)` event handlers now compile to one arity-helper call per site — `_$evt1(el, "$$click", fn, arg)` builds the `{ fn, args }` descriptor once at mount and returns it as the binding's single bag field (previously element + fn + every arg were cached separately), and `_$evt1u(d, fn, arg)` mutates that descriptor in place on update. Dispatch reads the element's event slot per event, so the mutation is observed with no identity compare, no object rebuild, and no property re-assignment — deleting the largest repeated update block in the generated code.
- 8de4584: Keyed `@for` correctness: a render-time call in the item body (e.g. `header.column.getIsSorted()` on a memoized TanStack Table header) now disqualifies the PURE/DEP-PURE survivor short-circuit, so the body re-runs on every parent render like React. Calls can read mutable state that neither the item reference nor the deps tuple witnesses — previously a ref-stable survivor could render stale output. Property-read-only bodies (the measured benchmark wins) keep the promotion; calls deferred inside event-handler closures stay eligible.
- 9be6ba5: Compiled output Phase 2: construct body helpers (`@if`/`@else` branches, `@switch` cases, `@try`/`@pending`/`@catch` arms, `<Activity>` bodies, `@for` item/`@empty` bodies, portal bodies) are now hoisted to module scope instead of being re-declared inside the component on every render — zero per-render closure allocations and stable helper identities. Captured parent locals ride the `__extra` ABI slot: the call site passes the current values as one small env tuple per construct (for `@for` it is the existing deps array doing double duty), the runtime stamps it on the construct's block, and the helper destructures it — the same values-at-last-parent-render staleness the closures had. Component children render-fns (`__children$N`) keep the inline placement (they are invoked through props, not through a construct block).
- db409de: compiler/vite: hand-slot-forwarding libraries are now self-declarative. A binding whose plain `.ts`/`.js` sources forward hook slots themselves declares `"octane": { "hookSlots": { "manual": ["src"] } }` in its own package.json, and the plugin's surgical hook-slotting pass skips files under the declared directories automatically (nearest-manifest lookup, cached per directory) — no more repeating `exclude` path lists in every Vite/Vitest config that aliases workspace sources. The scope is a directory list rather than the whole package so a binding's own test files stay auto-slotted. The `exclude` option remains as an ad-hoc escape hatch.
- 4f3c6c8: The compiler now rejects slot-keyed hooks inside plain JS loops (`for`,
  `for…in`, `for…of`, `while`, `do…while`). Hooks are keyed by a per-call-site
  slot, so every iteration of a loop shared the ONE slot assigned to that call
  site — `useState` silently shared a single state cell across iterations,
  `useMemo` recomputed every iteration with only the last entry surviving, and
  slot-keyed effects collided the same way. This was always documented as
  rejected; the check now exists, with a diagnostic pointing at the supported
  forms: the keyed `@for` template directive (each item renders in its own scope,
  so per-item hooks get per-item state) or extracting the loop body into a child
  component. `use()` and `useContext` are exempt (call-order / context-identity
  keyed, not slot-keyed) and keep working in loops, as do hooks behind a
  DEFERRED nested function boundary (local components, stored callbacks).
  Closures that execute during the iteration itself — IIFEs and inline callbacks
  to synchronous array-iteration methods (`.map`, `.forEach`, …) — are treated
  as inline and rejected too.
- 62c3c4e: Dynamic JSX tags that resolve to a host tag STRING at runtime (`<props.parts.title>` with `{ parts: { title: 'h1' } }`, `<Tag/>` with `const Tag = 'h1'`) now render correctly in template position on the client. Previously `componentSlot` created a block whose body was the string and crashed in `renderBlock` ("not a function") on both fresh mounts and hydration. The string comp now renders as a host element (props, refs, and delegated events applied via the de-opt prop machinery) with the compiled `children` render-fn inlined as the element's entire content — no nested marker block — matching the server's `<!--[--><tag>…</tag><!--]-->` emission so hydration adopts the element in place. Same tag across renders patches the element in place; a tag change or a string↔function flip tears down and remounts (React's element-type semantics). Value-position string tags (`.tsx` returns) were already handled and are unchanged.
- 3c56d95: `hydrateRoot()` now skips leading `<style data-octane>` tags when positioning the adoption cursor. A streamed shell flushes its deduped scoped-style tags ahead of the body markup (so painted fallbacks are styled), which previously broke hydration of streamed pages that use scoped `<style>` — the cursor adopted a style tag as the component root and rebuilt the whole tree.
- 4c5b1d0: Identifier JSX tags that don't start with a lowercase ASCII letter — `<_Inner/>`, `<$Inner/>` — now compile as component REFERENCES (`createElement(_Inner, …)`), matching JSX semantics (Babel/TS `isCompatTag`). Previously only `/^[A-Z]/` tags were components, so `_`/`$`-prefixed tags miscompiled to host string tags (`createElement('_Inner', …)`) on the client and invalid-tag errors or literal `<_inner>` markup on the server. Lowercase and dashed tags (`<div>`, `<my-element>`) stay host tags.
- b732399: Marker elision M3: a component call that is the sole root of a `@{ … }` body now INHERITS its parent block's marker range on all three sides — the client borrows the parent's markers instead of minting a `comp`/`/comp` pair, the server skips the child's `<!--[-->…<!--]-->` frame pair, and hydration adopts nothing at the site. Sole-child wrapper chains (layout stacks, `<ctx.Provider>` router/binding wrappers, member and dynamic tags included) collapse to the outermost pair with zero comments per layer. `key=` sites and the boundary builtins (Suspense/ErrorBoundary/Activity — declined by identity at runtime, so aliased/member references are safe) keep their pairs. As a side effect, a component-form and a bare-element-form of the same markup now serialize identically and cross-reconnect clean during hydration, matching React.
- 6d27cb0: Add `isChildrenBlock(value)` to distinguish compiled element/text children from render-prop function children.

  A component's element/text children (`<C><D/></C>`) lower to a render function, while a render-prop child (`<C>{(data) => …}</C>`) is passed through raw — both are `typeof === 'function'`, so React-ecosystem APIs that branch on `typeof children === 'function'` (function-as-child / render props) could not tell them apart. The compiler now tags compiled children-blocks (`markChildrenBlock`), and the new public `isChildrenBlock(value)` returns `true` only for them, so a consumer can write `typeof children === 'function' && !isChildrenBlock(children)` to detect a genuine render-prop child. Enables faithful ports of libraries whose components accept either content or a render function (e.g. Base UI's Dialog/Popover payload render functions).

- a3784b1: Hydration: `componentSlotLite` now advances the hydration cursor past its adopted `<!--[-->…<!--]-->` range after its body renders (mirroring `componentSlot`'s post-render advance). Before, a hookless component followed by a SIBLING hookless component in the same children block left the cursor parked on its adopted root, so the next slot adopted no range, its commit insert MOVED the previous sibling's element to the shared end anchor, and the second component's server DOM was stranded — multi-child `{children}` hierarchies (`<Box><Box/><Box/></Box>`) did not hydrate byte-stably. Nested and multi-child component hierarchies now adopt server markup byte-for-byte.
- fa77edf: `useFormStatus` now activates for the manual-action idiom (React parity): a `startTransition` called synchronously during a form's submit dispatch whose default was prevented (`onSubmit={e => { e.preventDefault(); startTransition(async () => …) }}`) publishes pending status to that form until every such transition settles. Previously only the intercepted `<form action={fn}>` path published form status. A plain async handler (no transition) or a non-prevented submit still never activates it, and the manual and intercepted paths share the same pending counter so overlapping submissions coalesce.
- f5c9dba: Compiler: the binding bag is now allocated in ONE shot by shared runtime arity factories (`bag0`…`bag16`, spill `bagOf`) with its real mount values — `_b = _$bag5(__s, _root, v0, …)` builds `{a: v0, b: v1, …}` (final hidden class + real field representations at allocation, one hot allocation site per arity), inserts the root, and commits `__s.slots[0]`, replacing the per-field property-write mount and the inline insert/commit pair. Bag fields are compiler-assigned 1-char names (minifiers can't shorten object properties — this is a shipped-bytes win: −17.6% minified / −5.5% gzip on the codegen-size corpus), except ref/spread/fragmentRef fields, which keep their long names for the runtime's suspense-hide ref walk and route through `bagOf`.
- 12d5410: Parallel `use()`: the compiler now eliminates suspense waterfalls from idiomatic sequential `use()` code — ON by default (opt out with `parallelUse: false` on `compile()`/the vite plugin for React-timing waterfall semantics). Non-trivial `use()` arguments compile to slot-keyed memoized creations (member-path deps — replays can never mint fresh promises, refetch happens exactly when inputs change); provably-independent creations in one body hoist above the first unwrap and suspend as ONE batch (`_$useBatch` — one boundary retry per settled stratum instead of one per promise); and suspended bodies warm the descendant fetch tree (compiled `Comp.__warm` plans start every child fetch whose reachability and props are provably independent of the suspended data, recursion depth-capped, dep-keyed cache adopted by the real mounts). A 10-level nested async chain (`benchmarks/async-waterfall`) drops from 174.8ms (10.9× the latency floor) to 20.1ms (1.3× — Solid 2.0 / Ripple territory) while React runs the same code at 307.3ms. Unwrap order, hydration-seed order, rejection routing, and `@pending`/transition semantics are unchanged; true data dependencies stay sequential.

  Always-on runtime hardening that shipped with it (flag or no flag): `use()` thenable slots are now scoped to one suspension episode (cleared on fresh renders and after a completed body — React's thenableState lifecycle), a resume replay that creates a fresh promise for a slot that already holds one reuses the stored thenable instead of re-suspending forever (with React's "uncached promise" dev warning), and a replay that discovers a new pending `use()` behind a data dependency logs a dev waterfall diagnostic.

- d71f1fc: Compiler: hook slot symbols in non-HMR output (production builds, SSR) are now `Symbol("<filenameHash>#<n>")` instead of `Symbol.for("octane:<module path>:<Comp>.<hook>#<n>")` — only HMR's module re-import needs the registry identity, and the old form leaked the ABSOLUTE source file path into shipped bundles (~80-120 chars per hook call site). The short description is load-bearing, not cosmetic: the runtime composes custom-hook slot paths from slot DESCRIPTIONS (`resolveSlot`), so it must stay unique per call site — a bare `Symbol()` collapses the composition and collides custom-hook state (pinned by the new prod-mode hydration smoke test). Dev serve keeps the stable `Symbol.for` keys so hook state survives hot swaps, including the plain-`.ts` `slotHooks` pass.
- 2f8c6ed: Compiled output: ref manifest. Bodies with ref-carrying bindings (`ref={…}`, spreads, `<Fragment ref>`) now stamp a module-scope manifest (`__s.refFields` — flat kind/field/element triads) that the suspense-hide path walks directly, replacing the key-prefix scan over the binding bag. Those fields therefore take normal 1-char names and ride the positional bag arity factories — previously one ref anywhere in a component forced the whole bag onto the named-literal spill. Detach/re-attach timing across a suspend is unchanged.
- 63e51e8: compiler: return-JSX functions now contribute real sourcemap segments. `compileReturnJsxFunction` prints via `printNodeWithMap` and threads esrap's per-token mappings into the module map (adjusted for inlined directive helpers and export wrappers), so chained maps over compiled output — e.g. @octanejs/mdx's two-stage `.mdx` map — compose instead of falling back to the intermediate-JSX map.
- 6d3b269: Runtime: two error/suspense boundary fixes surfaced by the @octanejs/tanstack-router
  parity work. (1) A catch-less `tryBlock` that receives an error mid-render now
  RETHROWS instead of synchronously delegating to the parent boundary's handler —
  delegation let the frames between the throw site and the outer boundary keep
  rendering into DOM the outer boundary's switch had already swept (stale-anchor
  `insertBefore` NotFoundError replacing the original error). (2) An update
  scheduled for a block inside a suspense-hidden subtree (try content
  soft-detached to `savedDom` while the fallback shows) now re-attempts the WHOLE
  boundary — reattach, render, reveal on success / re-stash on re-suspend — per
  React's "setState on a suspended component retries the render" semantics,
  instead of rendering the block against detached DOM geometry. Compiler:
  method-style hook calls (`route.useLoaderData()`, `api.useSearch()`) now get
  per-call-site slot wrapping (`withSlot` thunk preserving `this`), enabling
  object-carried hooks like TanStack Router's Route/RouteApi accessors.
- b171c6d: `octane/server` now exports the React-compatible element utilities the client entry already had: `isValidElement`, `cloneElement`, `Children`, and `createPortal`. Bindings that inspect or re-project descriptor children (recharts' axis-tick cloning, a Radix-style Slot) compile the same source for both modes, so these imports must resolve under the server build too — previously the SSR bundle failed with missing exports. Server `cloneElement`/`Children` mirror the client semantics over the shared descriptor shape; server `createPortal` mints the PORTAL_TAG descriptor the SSR serializer already renders as a bare site anchor (portal content mounts client-side on hydration).
- 7f3d9c9: SSR: tag server-compiled `__schildren` component-children render-fns with
  `markChildrenBlock`, matching the client emission. Untagged, a component's
  render-prop check (`typeof children === 'function' &&
!isChildrenBlock(children)`) misfired on the server only — the children block
  was INVOKED as a render prop, returned its HTML string, and the enclosing hole
  escaped that markup into visible text (e.g. the router `<Link><img/></Link>`
  logo rendering as raw `src="data:image/svg+xml,…"` text before hydration, plus
  hydration mismatches). Regression test:
  packages/octane/tests/hydration/children-local-hydrate.test.ts.
- 820baaf: SSR now renders member-expression / dynamic JSX tags (`<obj.tag/>`, `<{expr}/>`) whose runtime value is a host tag STRING — e.g. MDX's `_components.h1` mapping, unoverridden. `ssrComponent` routes a string comp to the host-element serializer inside the same single `<!--[-->…<!--]-->` block a component body gets (the client's de-opt descriptor shape), instead of calling the string as a component body (`TypeError: comp is not a function`). Dispatch stays dynamic: the same tag site renders a component when the runtime value is a function, and hydration adopts either shape without mismatch. Injection-unsafe tag strings still throw (`Invalid tag`), matching the client where `document.createElement` rejects them.
- c36cb32: SSR mirror of parallel `use()`. The compiler's memoize + hoist/batch passes now run on server bodies too (same `parallelUse: false` opt-out): independent `use()` creations register with the render loop in one batch before the first suspend, so a body stratum of K independent fetches costs ONE network round instead of K — measured flat at ~1×latency for k=4 and k=8 in the new `ssr-throughput` `parallel-k*` ops. Creations are memoized in a keyed cross-pass cache (`puMemo`), so discovery re-runs and the final canonical pass reuse the same in-flight promise instead of re-firing the fetch (a D=3 waterfall's first-level creator now fires once, previously three times). Batch-registered thenables resolve at their unwrap sites by instance identity; plain `use()` sites keep their exact occurrence-keyed semantics, and hydration seed order (use()-call order) is unchanged. True data dependencies remain sequential.
- c33f409: SSR now processes render-phase state updates, matching React's server renderer: a `useState`/`useReducer` dispatch fired while its own component renders queues the update and re-invokes the body until a pass settles (bounded at 25, then "Too many re-renders"), so `renderToString`/`prerender` serialize the converged state instead of the initial value. Dispatches after the pass or from a different component stay inert, exactly like Fizz. Each retry rewinds what the discarded pass emitted — `useId` numbering, suspense seed order, suspense/discovery registrations, hoisted head markup, and frame child/occurrence counters — so the settled pass is byte-identical to a single-pass render of the final state.
- 63e51e8: SSR: a return-JSX component returning a FRAGMENT (`function Doc() { return <>…</>; }`) now serializes hydration-compatibly. The client value-lowers the returned fragment to a descriptor array mounted by the return-slot `childSlot` — one slot range plus one `<!--[-->…<!--]-->` block per item (text items included) — but the server's template walk concatenated the children with markerless text separators and no slot range, so `hydrateRoot` silently rebuilt (duplicated) the content instead of adopting it. The server compiler now routes value-position returned fragments through `ssrChild([...])` over the same descriptor array, making server output byte-adoptable by the client. Single-element returns, `@{}` template bodies, and value holes are unchanged.
- 8fc8554: Two server-runtime fixes surfaced by the first production SSR build of an @octanejs/tanstack-router app:

  - `octane/server` now exports `flushSync` (server semantics: a render is synchronous and there is no update queue, so it runs the callback and returns its result — mirroring `startTransition`) and `isChildrenBlock`/`markChildrenBlock` (same `Symbol.for` key as the client runtime, so identity holds across mixed graphs). Router code importing these compiled fine for the client but failed to resolve in any SSR module graph.
  - Server compiler: synthetic subs (`@if`/`@for`/`@switch`/`@try` branches and `__schildren` component children) are now always compiled in TEMPLATE position. They previously reset to VALUE position, which made `ssrEmitComponent` take the descriptor-children path inside every sub — silently DROPPING directive-block children of nested components (`lowerJsxChild` cannot lower an `@if` to a descriptor) and desyncing the server block count from the client (which compiles those branches through the template walk). A `<C>@if (…) { … }</C>` nested one sub deep — e.g. the router's `Provider > CatchBoundary > @if { <Match/> }` chain — server-rendered `<C>` childless, blanking whole pages.

- 569daad: SSR warm walk — the server now executes compiled `__warm` fetch plans, completing the parallel-`use()` mirror across component depth. When a component's first batch suspends, its warm thunk starts descendant components' provably-independent creations (recursing through each child's own `Comp.__warm` plan, the same eligibility rules as the client: warm-safe props, guard chains preserved, edges gated on suspended data cut) and registers them with the render loop, so nested independent fetches all go out in pass 1: a depth-8 chain of ~4ms fetches renders in one ~4.6ms round instead of eight (new `ssr-throughput` `parallel-nested-d4/d8` ops, p50 flat across depth). The descendant's real render adopts the warmed promise by slot + deps (transfer semantics — each fetch fires exactly once; a props drift between warm and render is a clean miss). Seed order, true-dependency sequencing, and the `parallelUse: false` opt-out are unchanged.
- 6b7b727: Compile-time-baked static object styles now serialize in CSSOM shape (`width: 100px; overflow: auto;` — declarations terminated, not separated). Previously a baked `style` attribute dropped the final semicolon, so the same element's style read back differently depending on whether the style was static (template-baked) or dynamic (written through `el.style`) — an observable byte difference in innerHTML comparisons (and vs React, whose styles always go through CSSOM). Applies to both client templates and SSR output, which share the serializer.
- 2ce7bc5: Streaming SSR now delivers each Suspense boundary's segment at its OWN resolve time. The round loop in `renderToPipeableStream` / `renderToReadableStream` used to settle a round with `Promise.all` over every suspended thenable, so on a staggered data schedule the earliest boundary's HTML was held until the slowest sibling landed (one giant tail chunk). Rounds are now WAVES: await the first unresolved settle, coalesce everything else that lands in the same event-loop turn (one `setImmediate`/`setTimeout(0)` yield plus microtask drains), re-pass, flush newly-done segments, repeat — so simultaneous resolutions still share a single re-pass (the all-fast case stays at ~2 passes) while staggered boundaries stream as they arrive. `MAX_SUSPENSE_PASSES` accordingly now bounds CONSECUTIVE passes that complete no boundary (one pass per resolution wave is legitimate, not a runaway); waterfall-depth and nondeterministic-key runaways still trip it. Buffered `prerender` settling is unchanged.
- c6a23f5: SVG-only tags (`g`, `rect`, `path`, `circle`, … — every tag with no HTML counterpart) now imply the SVG namespace in namespace-ambiguous positions: a component whose ROOT is such a tag, a value-position/`createElement` descriptor, fragment roots, and portal children targeting an SVG container. Previously these compiled/rendered as HTML-namespace elements (`HTMLUnknownElement`) that paint nothing inside an `<svg>` — a component returning `<g>…</g>` only worked if its markup lexically sat under `<svg>` in the same file. The inference table (`SVG_ONLY_TAGS`) is shared by the compiler's template namespacing and the runtime's de-opt reconciler; ambiguous names (`a`, `title`, `script`, `style`) keep the inherited namespace, matching browser foreign-content rules.
- c93aad5: Compiler: an SVG `<title>` (the accessibility tooltip element) is no longer
  head-hoisted — hoisting `<title>`/`<meta>`/`<link>` to document.head now skips
  svg-namespace subtrees, matching React 19's exception. Previously a tooltip
  inside `<svg>` was hoisted on the client (stomping the document title) and made
  the server compile throw ("does not support node type HeadHoist"). Also fixes
  the server emitter's namespace tracking (`nsForSelf`/`nsForChildren` were
  called with the node instead of the tag, so svg subtrees never entered the svg
  namespace server-side). Regression tests:
  packages/octane/tests/svg-title-hoist.test.ts.
- 2942afb: Six React-parity fixes surfaced by the react-hook-form port. (1) `act()` now supports React's SYNC form: a non-async callback has all scheduled work (renders + effects) flushed synchronously before act returns, so `act(() => setState(...)); expect(...)` works without awaiting; async callbacks keep the awaited drain-until-quiescent behavior. (2) Zero-arg `useState()` / `useRef()` (state/ref starting undefined) no longer throw "called without a slot symbol" — the compiler appends the slot as the last argument, so it lands in the initial-value position and is now reinterpreted, matching the effect hooks' ABI rule. (3) The compiler drops type-only statements (`type X = …`, `interface I {}`) declared inside function bodies from the runtime emit — previously the nulled-out alias crashed the printer; top-level statements were already filtered. (4) The de-opt pure-host → component upgrade now ADOPTS the existing host tree instead of rebuilding it: when a conditional child of a previously component-free createElement tree flips to a component, the element and its raw children are adopted in place (recursively) into the blocks representation — sibling host nodes keep their identity, focus, and input state, matching React. (5) Controlled checkables (`checked={…}` + native `onInput`/`onChange`) work now: the controlled-state restore no longer runs at the end of the CLICK dispatch (the platform fires `input`/`change` AFTER click, so native handlers read a reverted `checked` and the toggle was unusable); the follow-up input/change arms the restore instead, and rejected toggles still snap back. (6) Mixed fragment children in the de-opt list path (`<>{items.map(...)}<button/></>`) now key nested-array leaves WITHIN their top-level slot (compound keys, like React's implicit-key scoping) — a nested list growing or shrinking no longer shifts a sibling's implicit key and remounts it.
- 388b23c: Value-position JSX fragments (`return <>…</>` in `.tsx` bodies — and every MDX document root compiled through `@octanejs/mdx`) no longer trip the de-opt missing-key warning. The compiler now lowers a fragment's children through the new `positionalChildren([...])` tier-2 runtime export, marking the array as FIXED siblings (React's "static children" — `jsxs` — which React never key-warns) so the de-opt list keys it by index silently. This also covers interleaved text items (MDX's `"\n"` separators), which can never carry a key. Runtime-built arrays (unkeyed `.map()` results, arrays through props) keep the warning.
- 352cff1: `<ViewTransition>` (experimental, React-parity core): transition-lane commits
  that touch a boundary now run inside `document.startViewTransition` — enter
  (subtree inserted), exit (subtree removed), and update (inner mutation /
  size change) activations with auto view-transition-name assignment and
  `onEnter`/`onExit`/`onUpdate` callbacks. Falls back to a plain synchronous
  commit when the browser has no View Transitions support; `flushSync` and
  urgent updates skip the animation (React's rule). Also exported as
  `unstable_ViewTransition` so React-experimental imports port unchanged.
  Shared-element `share`/`name` pairing, `addTransitionType`, Suspense-reveal
  integration, and SSR annotations land in later phases
  (docs/view-transitions-plan.md).
- c7989eb: View Transitions phase 2: shared-element transitions + transition types + the
  full callback contract. Same-named boundaries deleted/inserted in one
  transition-lane commit now pair as a shared-element transition (`onShare`
  fires on the exiting side, suppressing its `onExit` and the entering side's
  `onEnter`; pairs decay to separate exit/enter when either side is outside the
  viewport). New `addTransitionType` (+`unstable_addTransitionType`) tags the
  current transition batch — the types array reaches every on\* callback, and
  `enter`/`exit`/`update`/`share`/`default` class props now resolve strings,
  `'auto'`, `'none'` (deactivates the boundary), or per-type maps
  (`{ 'nav-back': 'slide-right', default: 'auto' }`), applied as
  `view-transition-class` alongside the name. Callbacks now receive
  `(instance, types)` where the instance carries `.animate()`-capable handles
  for the boundary's `old`/`new`/`group`/`imagePair` pseudo-elements, and a
  returned cleanup runs before the boundary's next activation.
- dda2854: View Transitions phase 3: Suspense integration + scheduling depth. Suspense
  reveal commits (fallback → content, standalone or the entangled held-
  transition batch) now route through the view-transition controller — a
  boundary wrapping the Suspense update-activates on the swap, and boundaries
  inside the revealed content enter. Nested boundaries inserted/removed as ONE
  unit fire only the outermost enter/exit (React's rule; nested stay silent).
  `render()` called inside a transition no longer commits synchronously — it
  schedules at transition priority, so boundaries mounting with the initial
  content enter-animate (e.g. a Suspense fallback appearing under a
  `<ViewTransition>`). Passive effects scheduled during an animation now wait
  for the transition's `finished` (React's ordering); update detection also
  catches element replacement (identity, not just count).
- dda2854: View Transitions phase 4: parent enter/exit relays (React's
  `enableViewTransitionParentEnterExit` — on in the experimental channel where
  ViewTransition ships). New boundary props `parentEnter`/`parentExit` (class
  values, per-type maps supported) + `onParentEnter`/`onParentExit` callbacks: a
  nested boundary inside a subtree that entered/exited as one unit now activates
  its parent relay when every strict intermediate boundary also relays (declares
  the relay prop or handler and doesn't resolve `'none'`) and the unit's
  outermost boundary genuinely enters/exits — not `'none'`, not consumed by a
  shared-element pair. Plain DOM between boundaries never breaks the chain;
  handler-only boundaries participate; a `'none'` relay class stops the chain
  below it. All 25 in-scope ReactDOMViewTransition tests are now ported and
  passing.
- 3a9d855: View Transitions phase 5 (final): Fizz-parity SSR annotations. Server renders
  now stamp resolved `vt-*` attributes on each `<ViewTransition>` boundary's
  first element — `vt-update` always (per-type maps resolve to their `default`;
  SSR has no transition types), `vt-name` + `vt-share` for explicitly named
  boundaries and for boundaries wrapping a Suspense boundary (auto names derive
  from the stable frame path, so every streaming pass mints the same name and
  the fallback/content captures pair across the swap), and `vt-enter`/`vt-exit`
  on boundaries at the top of a Suspense content/fallback arm (both can apply).
  Streamed segment chunks carry the wrapping boundary's name onto the revealed
  content. Hydration adopts the annotations untouched. All 4
  ReactDOMFizzViewTransition tests are ported and passing — the View
  Transitions plan is complete (see docs/view-transitions.md for the user-facing
  guide).
- 1f85217: A lone pure-host descriptor at a value position (e.g. `createElement('div')` returned from a pass-through component or rendered at a root) now mounts ANCHORLESS — no comment markers, the element self-delimits, mirroring the singleRoot component regime. `container.firstChild` is the element itself (React/RTL parity) instead of a comment anchor. A later render that flips the slot's value to another mode (text, null, array, component, portal) promotes the slot to the marked regime in place.

## 0.1.3

### Patch Changes

- 71b5167: Attribute-write fixes surfaced by the Tier-3 React DOM attribute-matrix port:

  - **Enumerated attributes stringify their boolean form**: `spellCheck={false}` / `contentEditable={false}` / `draggable={false}` now write `"false"` instead of removing the attribute — an absent enumerated attribute means "inherit / UA default", a genuinely different platform state (e.g. `contentEditable={false}` used to silently flip back to inherited editability).
  - **Empty `src`/`href` are stripped** (React parity, dev + prod): an empty-string URL resolves to the current page, so browsers would re-fetch the whole document as an image/script/stylesheet. `<a href="">`/`<area href="">` keep it (a legitimate self-link).
  - **Function and symbol attribute values are removed** instead of stringified — a function's source text can never leak into the DOM.
  - **`className={null}` removes the `class` attribute** (React parity); an empty string still writes `class=""` — the raw-value distinction is checked before clsx composition erases it.
  - **SSR style values are trimmed** (`{left: '16 '}` → `left:16`), matching what the client CSSOM produces on parse — removes a server/client byte divergence.

  Documented intentional divergences (native pass-through, no known-attribute table): `unknown={true}` writes boolean presence (`""`) rather than being stripped; `inert=""` stays present (platform: presence = true; React coerces to false); truthy strings on boolean attributes stay verbatim (`disabled="disabled"` — functionally identical state); throwing-valueOf objects render their `toString()` instead of throwing. React-19 custom-element semantics (lowercase `on*` listeners, property-vs-attribute heuristics) remain an open, pinned gap.

- 7b2acbd: `useDeferredValue` React-parity fixes (closes the five gaps pinned from
  ReactDeferredValue-test.js) via a "deferred lane" bit on the scheduler:

  - **Render-phase updates inherit the in-progress render's priority**: a
    setState fired while the same component's body is rendering replays at the
    current pass's priority (and deferred bit) instead of always urgent — so a
    transition render that syncs state from props no longer makes
    `useDeferredValue` defer in the replay (both values commit in one pass).
  - **Only the first `useDeferredValue` level defers**: the spawned deferred
    swap tags its re-render pass as deferred (`Block.currentRenderDeferred`); a
    `useDeferredValue(value, initialValue)` MOUNTING inside that pass adopts the
    final value directly instead of waterfalling its own preview — the outer
    preview already covered the loading state (React's anti-waterfall rule).
  - **Hidden `<Activity>` trees behave like fresh mounts for the hook**: a value
    change while hidden re-renders the NEW preview state (prerender keeps up);
    revealing hidden→visible with a different value shows the preview first
    (with `initialValue`) or adopts the new value immediately (without) — the
    hidden tree's committed value never flashes on reveal. Revealing with an
    identical value still skips the preview (prerender payoff, unchanged).

- a000fa2: Host-element ref lifecycle now matches React's commit phasing across all paths.

  - De-opt host refs (object and callback `ref`s on `createElement`/value-position
    JSX) are detached when their subtree is torn down: keyed-list item removal,
    full list clears (including the `batchClearItems` fast path), wholesale scope
    unmount of a pure `hostNode` or `hostElementBody` element, and mode-switch
    rebuilds. Previously `ref.current` kept pointing at the removed DOM node and
    callback refs never received their `null`/cleanup call.
  - All ref detaches — teardown and identity swaps, compiled templates, spreads,
    fragment refs, and the de-opt paths alike — are deferred to commit and drain
    before that commit's ref attaches (React's mutation→layout phasing). A ref
    hopping between elements in one render no longer ends `null` when a later
    binding's detach ran after an earlier binding's attach, and a state setter
    used as a ref settles on the replacement element instead of oscillating.
  - `useImperativeHandle` honors a callback ref's React-19 cleanup return: detach
    runs the returned cleanup instead of re-invoking the ref with `null`.

- 71b5167: Hardening + parity fixes surfaced by the ReactDOMComponent conformance port:

  - **SSR tag-name validation** (security): a dynamic de-opt tag like `createElement('div><img onerror=…>')` was concatenated verbatim into the server response — it now throws `Invalid tag` like React. (The client was already guarded by `document.createElement` itself.)
  - **Client attribute writes are guarded**: an injection-shaped attribute name arriving through a spread used to crash the whole render with `InvalidCharacterError`; it is now reported and skipped, mirroring the SSR serializer's `VALID_ATTR_NAME` rejection.
  - **`dangerouslySetInnerHTML` validation** (React parity): a malformed value (not `{__html}`) and combining it with `children` now throw instead of silently rendering; `__html: false` renders `'false'` consistently on both the compiled and spread paths.
  - **`<link onLoad>`/`onError` now fire**: hoisted head elements live outside every delegation root, so the compiler now passes `on*` props through and `headBlock` attaches them as direct listeners (SSR skips them).
  - **iOS Safari tap delivery**: delegation roots (createRoot containers + portal targets) get a noop `onclick` property so the whole subtree is tappable — the root-delegation equivalent of React's per-element stamping.
  - **Boolean style values clear the property** (`fontFamily: true` no longer sets the literal string `"true"`), client + SSR.
  - **`suppressContentEditableWarning` never lands in the DOM.**

  Documented intentional divergences: no `possibleStandardNames` alias table (attribute names are written as authored — use native spellings like `accept-charset={…}`, valid in TSRX and React alike), and `muted` stays a plain attribute per the no-controlled-properties policy (the live `.muted` property belongs to the platform). Still pinned: void-element children/dSIH validation (compile-time diagnostic planned) and React-19 custom-element semantics.

- 735f5ca: Keyed `@for` reorders no longer re-render survivors whose only change is position.

  When a `@for` header binds no `index` name, its body cannot observe an item's
  position, so a pure reorder (same item reference, moved to a new index) does not
  need to re-render the survivor — only its DOM moves. The compiler now marks such
  loops index-independent (a new `forBlock` flag), and the reconciler's pure
  short-circuit skips the body for a moved survivor instead of calling `renderBlock`.
  Previously every moved survivor re-rendered even though its output was identical.

  Measured on a 1000-row keyed table: displace-k −46–48%, rotate/remove-first
  −21–33%, reverse/shuffle a few percent (there the DOM moves dominate). An `@for`
  that binds an `index` still re-renders on reorder so the index value stays correct
  (conservative: the optimization applies only when the header provably binds no
  index).

- 634c4b4: Compiler-emitted runtime helpers can no longer be shadowed by user bindings. Generated code used to import and call helpers by their bare names (`setText`, `htext`, `clone`, `template`, …), so a user binding with the same name inside a component silently hijacked the generated call — `const [text, setText] = useState('')` (React's most common naming for text state) broke the text-hole update and stored a DOM Text node in state, and a module-level `const template = …` was a duplicate-declaration SyntaxError against the prelude import. The compiler now imports every generated-code helper under a collision-proof alias (`import { setText as _$setText } from 'octane'`) and references it as `_$setText(…)`, on both the client and server (`octane/server`) codegen paths — covering all emitted helpers (text/attr/style/class/spread setters, block helpers, refs, `createElement`, `withSlot`, `normalizeClass`, HMR wiring, and the `ssr*` family). Names the user's own code references — their preserved `octane` import specifiers (including `x as y` renames, which previously lost the alias) and slotted base-hook call sites — stay un-aliased.
- 1987d47: Implement React's implicit same-element bailout, and fix a context-propagation bug the work surfaced:

  - **Implicit bailout (React beginWork's `oldProps === newProps` skip):** re-rendering a parent that passes an identical (reference-equal) element to a value position (provider children, `.ts` binding trees, `return children` passthroughs, cached array items) now skips that child's body outright, while consumers of a changed context inside the bailed subtree still refresh via lazy per-context propagation. Value-position component blocks are armed as context-stamping targets (like `memo()` blocks) so the bail is always sound; compiled template positions re-create props per render and pay nothing. `@octanejs/radix`'s NavigationMenu no longer needs its `MemoChildren` memo() shim or its shallow-equal registration convergence bail — both were workarounds for this exact gap and are now deleted.
  - **Bugfix — bailed subtrees no longer strand context consumers:** a memo boundary's re-render (own props changed) interleaved with an inner memo bail used to erase the outer boundary's recorded context dependencies (its `$$ctxReads` cleared, the bailed inner subtree never re-stamping them), so a LATER context change could bail straight past the consumer and leave it on a stale value. Bails now re-stamp the bailed block's surviving context deps onto memo/armed ancestors.

- fda2200: Compiler: fix reversed child order when a component root precedes a static host root
  in a multi-root fragment body.

  A component authored as `<><Comp/><input/></>` (or whose children are threaded through
  `createElement` as a compiled children fragment — e.g. a headless UI binding that renders
  `createElement('fieldset', { children })`) dropped the component root's source-order `<!>`
  anchor. The static template content drained into the parent first and the component was
  appended at `endMarker` AFTER it, so `<Comp/>` before `<input/>` rendered as
  `<input/>` then `<Comp/>`. The fix emits the `<!>` anchor for a component root in a mixed
  body, mirroring the in-element mixed-children path and the control-flow root path — so the
  component mounts at its source position. The server already emitted source order, so this
  also removes a client/server divergence that could mis-adopt on hydration.

- 71b5167: Native event delegation fixes (surfaced by the Tier-3 React event-matrix port — 212 conformance tests, all passing):

  - **Non-bubbling native events now reach their target's handler.** The media/resource lifecycle family (`play`, `pause`, `timeupdate`, `load`, `error`, `loadstart`, …), `toggle`/`beforetoggle`, `close`/`cancel`, `abort`, and `resize` were delegated with a bubble-phase root listener that never hears a non-bubbling event — so `onPlay` on the `<video>` itself silently never fired. They are now capture-delegated with target-only delivery: the target's own handler fires, ancestors' do not — exactly the platform contract. (React's synthetic layer re-dispatches these up the tree; octane deliberately does not — documented intentional divergence.)
  - **Capture handlers now fire before bubble/target handlers for capture-delegated types** (`focus`, `blur`, `invalid`, `scroll`, `scrollend`, and the new family). Both dispatchers are capture-phase listeners on the same root, so same-node registration order used to invert React/platform ordering (bubble walk before capture pass). The walk dispatcher now runs the capture pass explicitly first and honors a capture-phase `stopPropagation`.
  - **A throwing or invalid listener no longer aborts the dispatch walk.** Each handler invocation is guarded like a separate native listener: exceptions surface through the global error event (`reportError`, with the standard polyfill fallback) and the walk continues to ancestors; a non-function listener value is reported and skipped instead of crashing dispatch.

- fda2200: Add three React parity APIs, closing the "missing API" gaps short of streaming SSR:

  - `lazy(load)` — code-splitting. Suspends into the nearest `@try`/`<Suspense>` until the module promise settles, then tail-calls the loaded component (hooks, context, and props flow as if statically imported); a rejected load routes to `@catch`. Works on the server too: `renderToString` emits the pending fallback, `prerender` awaits the module. Accepts `{ default: Component }` or a bare component function.
  - `requestFormReset(form)` — React DOM parity. Inside a transition/action the reset is deferred until the action window settles (the manual companion to the automatic reset of plain `<form action={fn}>`); outside one it warns and resets immediately.
  - `useDebugValue()` — no-op (octane has no devtools inspector), so custom hooks ported from React run unchanged.

  All three are exported from `octane` and mirrored in `octane/server`. (`createRef` stays out: it exists for class components, which octane does not support.)

- 3431ec3: React parity: an unguarded render-phase state update (a `setState` called
  unconditionally during render) now throws `Too many re-renders. Octane limits the
number of renders to prevent an infinite loop.` after 25 same-block re-renders in one
  drain, instead of hanging the flush forever. The error routes through `@try` /
  `ErrorBoundary` like any render error. Guarded derived-state patterns (mirror a prop,
  converge in a few passes) are unaffected and now pinned by conformance tests.
- 3afe217: Resource hints land (React DOM parity): `preload`, `preinit`, `preconnect`, and `prefetchDNS`, exported from `octane` and mirrored in `octane/server`. Client calls insert deduped `<link>`/async-`<script>` tags into `document.head`; server calls collect into the render's head output (flushed with the streaming shell). A shared `data-oct-hint` dedupe key means a hydrating client call for an SSR-emitted resource is a no-op.
- 1a1f1db: Multiple unhandled root errors in one flush now aggregate (React parity): when several roots throw during a single synchronous flush and no boundary handles them, the flush rethrows an `AggregateError` carrying every error instead of silently keeping only the first. A single unhandled error still rethrows as-is; failed roots still unmount and the rest of the queue still commits. Also: SSR spread attributes now skip function/symbol values and `suppressContentEditableWarning` (mirroring the client's setAttribute policy).
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
- 5e3858f: SSR serialization + hydration React-parity fixes (Tier-4 conformance):

  - Adjacent dynamic text holes serialize with a `<!-- -->` separator so the parser can't merge them; the hydration walk adopts each hole's node (previously the second hole's content was lost, and adjacent empty holes crashed hydration). Empty static text literals no longer desync template child paths.
  - Multi-root fragment bodies hydrate through a virtual wrapper: root fragments with component members adopt cleanly (previously the cursor desynced and content was detached/re-appended), and the mount drain is a hydration no-op (`drainFrag`).
  - Nested-array children flatten one item per leaf in the de-opt list (React fragment semantics) — previously a nested array member rendered as nothing on the client and desynced hydration; component-bearing items now borrow their adopted item range.
  - `ssrAttr` mirrors React's value-type filters where the functional outcome flips — and the client `setAttribute` applies the same rules (shared tables in constants.ts) so hydration agrees with the serialized markup: positive-numeric drop (`size={0}`), empty `src`/`href` strip (except `<a>`/`<area>`), function/symbol drop, `data-*` boolean stringify, boolean drop on string props (`href={true}`), unknown lowercase `on*` drop, `htmlFor` kept verbatim on custom elements, and `suppressContentEditableWarning` never serializes. Boolean-prop truthiness (`hidden={0}`, `inert=""`) deliberately stays native-as-written on both sides (adjudicated divergence).
  - `<pre>`/`<textarea>`/`<listing>` protect a leading newline (the parser eats it) by emitting an extra `\n`.
  - A plain-object child throws ("Objects are not valid as a child") instead of serializing `[object Object]`.
  - Parser CR/CRLF→LF normalization no longer reports a spurious hydration text mismatch.

- d2afbbb: Streaming SSR: `renderToPipeableStream` (Node streams) and `renderToReadableStream` (web streams) land in `octane/server` — React `react-dom/server` parity with out-of-order Suspense streaming.

  - **Shell first**: one synchronous pass flushes immediately — scoped styles, hoisted head, the body with each still-pending `@try`/`<Suspense>` boundary rendering its fallback behind a `<template data-oct-b="N">` sentinel, the shell's `use()` seeds, and a ~600-byte inline swap runtime. `onShellReady` fires at flush.
  - **Out-of-order completion**: as each boundary's data settles, the stream appends a hidden segment (`<div hidden data-oct-s="N">`) holding the real content plus that boundary's own `use()` seed JSON, followed by `$OCTRC("N")` — which swaps the content into the boundary's live range, stashes the seeds on `window.$OCTS`, and leaves a `<!--oct-seed:N-->` scoping comment. Nested boundaries stream parent-first; a rejected promise streams the `@catch` arm through the same path. `onAllReady` fires when the last boundary lands; `abort()`/`signal` mark still-pending boundaries errored (`$OCTRX`) so hydration client-renders them.
  - **Hydration**: the client's `mountTry` recognizes the seed-scope comment and scopes that boundary's seeds to its subtree during adoption — a streamed page hydrates byte-for-byte with no re-suspend, no rebuild, and no mismatch warnings, verified end-to-end (stream → swap-runtime execution → `hydrateRoot`).
  - Built on the same pass/cache engine as `prerender`: each settle round re-renders against the warmed cache and flushes newly-completed boundaries (plus any late scoped styles). The compiled `@try` emit now routes through a runtime `ssrTry` helper (byte-identical output for buffered renders), and the JSX `<Suspense>` builtin streams too.

  Documented divergences from React Fizz: no selective hydration (octane has no synthetic event replay), per-round re-passes rather than per-boundary incremental renders, and head elements hoisted from inside a streamed boundary are re-created client-side on hydration rather than shipped mid-stream.

- 1987d47: Two hide/reveal fidelity fixes (React Offscreen parity):

  - **Insertion effects stay connected while hidden** (per `Activity-test.js:1428`): hiding an `<Activity>` (or a suspended boundary) no longer runs `useInsertionEffect` cleanups, revealing no longer re-fires them, and a deps-changed update while hidden still cycles them — insertion effects own injected styles that must persist while a tree is merely hidden; only a real unmount tears them down. Each effect slot now records its phase so the hide machinery can single insertion effects out.
  - **Closure-attached refs now cycle across a suspend** (per `ReactSuspenseEffectsSemantics-test.js:2877`): refs inside a spread object, `<Fragment ref>` instances, and refs on value-position pure-host descriptors (the de-opt path, nested elements included) are now detached when a boundary suspends and re-attached on reveal, matching the compiled template host-ref behavior. Previously these three flavors kept pointing at hidden DOM.

- eb48930: Error-handling fixes surfaced by the Tier-7 React error-boundary port (React 19 parity):

  - **Deletion-phase errors reach boundaries**: an error thrown by an unmount cleanup used to be swallowed with `console.error`; it is now collected during the teardown walk and dispatched to the boundary enclosing the deletion after the walk completes (a boundary inside the deleted range is itself dying and is skipped), so the enclosing `@try` shows its `@catch` like React's `commitDeletionEffects` error routing.
  - **Throwing ref detaches route to the boundary too**: a callback ref that throws on its `null` detach no longer escapes `flushSync` to the caller — the queued detach is guarded, the remaining detaches/attaches still run, and the error reaches the nearest still-mounted boundary.
  - **Refs of aborted mounts are never invoked**: when a boundary unwinds a mount that never completed, the queued ref detach is suppressed — React never calls a ref (not even with `null`) for work that never committed. A previously-attached ref still detaches normally on real unmounts.
  - **Uncaught errors unmount the whole tree**: when no boundary handles an error, the failed root's entire tree is removed from the DOM before the error is rethrown from the flush (React's documented contract — known-broken UI never stays on screen). Unrelated roots batched into the same flush keep draining.

  The port also stress-verified the LIS keyed reconciler under mid-reconcile throws (40 seeded shuffle streams of 101 keyed rows, byte-equal against from-scratch baselines) — no inconsistency found.

- 3431ec3: React parity: `useReducer` dispatch no longer eagerly bails out on `Object.is`-equal
  state. Unlike `useState`'s setter (which keeps its eager fast path, matching React's
  `dispatchSetState`), a dispatch whose reducer returns the same state still re-renders
  the component once, matching `ReactHooksWithNoopRenderer-test.js` ("useReducer does not
  eagerly bail out of state updates").
- 87c5bc3: Children and `dangerouslySetInnerHTML` on void elements (`<input>`, `<br>`, `<img>`, …) are now rejected instead of failing silently (React parity — React throws "`input` is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`"):

  - **Compile-time diagnostic** (client, server, and value-position `createElement` lowering): `<input>{'kid'}</input>` and `<input dangerouslySetInnerHTML={…}/>` now fail the compile with a source-located error. Previously the template parser silently dropped the children out of the emitted `<input>…</input>` markup, and the `htmlOnlyChild` fast path wrote invisible `input.innerHTML`.
  - **Runtime throw** on the routes the compiler can't see: a spread (`<input {...props}/>`) or de-opt (`createElement('input', {dangerouslySetInnerHTML})`) descriptor carrying `dangerouslySetInnerHTML` onto a void host now throws from `setAttribute`'s danger arm.

## 0.1.2

### Patch Changes

- c19f1aa: React parity: `aria-*` attributes are now treated as ENUMERATED, not boolean.

  `aria-expanded={false}` now renders `aria-expanded="false"` (was: attribute removed) and
  `aria-expanded={true}` renders `aria-expanded="true"` (was: `aria-expanded=""`), matching
  React — only `null`/`undefined` removes an `aria-*` attribute. Applied consistently on the
  client (`setAttribute`, and therefore the de-opt/spread paths) and in SSR (`ssrAttr`), so
  server and client agree and accessibility state serialises correctly.

- 6983478: React parity: static `aria-*` boolean literals bake as enumerated "true"/"false".

  The compile-time static-literal attribute fast paths (client template HTML and
  SSR) bypassed the `aria-*` enumeration the runtime `setAttribute`/`ssrAttr`
  already implement: a static `aria-hidden={false}` was dropped entirely and
  `aria-expanded={true}` baked a bare attribute. Both fast paths now special-case
  `aria-*` boolean literals — `false` renders `aria-x="false"` and `true` renders
  `aria-x="true"`, matching React and the dynamic-value path, so accessibility
  state serialises correctly regardless of whether the value is static or dynamic.

- 6983478: Callback-ref cleanups are now paired per (ref, element), matching React 19.

  React stores a callback ref's returned cleanup per attach site. Octane kept one
  cleanup per ref FUNCTION, so the common list pattern — the same `ref={registerItem}`
  on every row — overwrote earlier cleanups: removing row 1 ran row 2's cleanup and
  row 2's later detach fell back to `ref(null)`. `attachRef` now keys cleanups by
  (ref, attached element/fragment) and every detach site (runtime and compiled output)
  passes the element it is releasing, so exactly the right cleanup runs.

- 169c7c6: Fix children passed from a `.tsrx` parent through a `.ts` component that forwards them
  onto a host element via `createElement` (e.g. a binding component like
  `@octanejs/floating-ui`'s `FloatingOverlay` doing `createElement('div', { children })`).

  Two issues are addressed:

  - `descNeedsBlocks` now treats a render-FUNCTION child as needing a Block. The `.tsrx`
    lowering of `<Host>{children}</Host>` passes `props.children` as a component body (not a
    descriptor); previously such a child reached the raw de-opt reconciler and rendered as
    nothing.
  - `childSlot` now reconciles a bare render-function child by SLOT (swapping the block body
    in place) instead of by identity. A `.tsrx` children body is re-created every render, so
    identity-based reconciliation re-mounted the child on every parent render — losing its
    state and, once effects re-rendered the tree, looping unboundedly.

  `.tsx` callers (which pass descriptor children) were unaffected; this fixes the `.tsrx`
  → `.ts`-component children path.

- 86ae0c5: Add React-compatible `cloneElement`, `Children`, and `isValidElement` to the public API.

  These operate on octane's element descriptors (`createElement` / JSX-at-value) and children
  values, mirroring React's semantics so libraries that inspect or re-project children — a
  Radix-style `Slot`/`asChild`, `Children.only`, `Children.map`, etc. — port unchanged.

  - `cloneElement(element, config?, ...children)` — shallow-merges props (config wins),
    overrides `key`, and replaces children when passed (else keeps the original). `ref` merges
    as a normal prop (octane is ref-as-prop).
  - `Children.map` / `forEach` / `count` / `toArray` / `only` — flatten nested arrays and treat
    `null`/`undefined`/booleans as empty (visited as `null`; dropped from `toArray`/`map`
    results), matching React's traversal.
  - `isValidElement(value)` — true for `createElement` / JSX descriptors.

  Verified byte-for-byte against React via the differential rig (the same fixture runs through
  octane and `@tsrx/react`, where these imports resolve to React's own implementations).

- 357f841: Add clsx-style `class` / `className` composition to the runtime.

  `class` and `className` now accept strings, numbers, arrays, objects, and any nesting
  of those — composed the same way the `clsx` / `classnames` packages do (falsy parts
  drop out; object keys are kept when truthy). For example
  `class={['btn', props.size, { active: isActive }, props.extra]}` renders `"btn lg active"`.

  - Native, dependency-free: a new `normalizeClass` helper (exported from `octane` and
    `octane/server`) inlines the algorithm and fast-paths plain strings (~3× faster than
    the `clsx` package on the common `class={someString}` path), with byte-identical output.
  - Applied at every class site: dynamic bindings, `{...spread}` props, SVG elements
    (via `setClassAttr`, which still removes the attribute on a nullish value), and
    scoped-`<style>` components — where a compiler pre-pass normalizes the value _before_
    the scope hash is appended, so array/object classes compose correctly alongside the
    hash (and a nullish class no longer emits the literal `"undefined <hash>"`).
  - SSR (`ssrAttr`) composes identically, so a server-rendered composed class hydrates
    without a mismatch.

  This is an intentional divergence from React, which coerces `className={['a','b']}` to
  the string `"a,b"`; Octane yields `"a b"`.

- 6675ac7: Compiler: emit smaller mount code for two common shapes.

  - **No binding bag for control-flow-only bodies.** A component/branch body whose
    output is purely control flow or component slots (no static HTML — e.g. the
    recursive `Node` in a deep tree, an `@if` wrapper, a Provider/portal body) no
    longer allocates a per-render binding-bag object or commits it to `slots[0]`.
    Its hosts are `__block.parentNode` (recomputable every render) and its anchors
    `__block.endMarker`, so the `let _b … if (_b === undefined) { _b = {}; … } else {}`
    scaffold is dropped entirely and slots start at index 0. This removes one object
    allocation per such block instance (meaningful for control-flow-heavy trees) and
    shrinks the compiled output (~24% smaller for the recursive-context benchmark's
    component).
  - **Shared DOM-navigation prefixes.** Template element references are now walked
    incrementally from the nearest already-materialized ancestor instead of
    re-walking the whole path from the cloned root for every hole. Siblings that
    share a deep prefix (e.g. a row of buttons) reuse the prefix's navigation var
    rather than repeating `child(child(child(_root)))` per element — fewer
    `child`/`sibling` calls at mount and less repeated code.

  Compiled `.tsrx`/`.tsx` output format changed (regenerate any committed build
  output). No public component-API or behavior change.

- f414710: Performance: faster context reads and text updates.

  - `use(Context)` now caches the resolved provider per consumer, so repeat reads are an O(1) live-value lookup instead of an O(depth) walk up the scope/block tree. Removing the per-read walk also keeps the shared property inline-caches monomorphic, which speeds up the surrounding render path. On a deep-tree context-fan-out benchmark (1024 consumers re-reading a root context) this cut the full-tree update from ~3.0ms to ~1.6ms.
  - `setText` no longer reads `node.data` back before writing. The compiler already guards every text-binding update with a previous-value check, so the read only re-confirmed a known change while materializing a throwaway string from the DOM each call — pure CPU and GC overhead on text-heavy updates.

  No API or behavior changes.

- 894d51c: `createElement` is now React-shaped around `key` and `props`. `key` is lifted OUT of
  the descriptor's `props` (it was previously left on it), and the caller-supplied props
  object is never mutated — positional children are folded into a fresh copy instead of
  being written onto the caller's object. The hot 2-arg `createElement(Comp, props)` path
  (no key, no positional children) stays allocation-free and passes props through.
- f44fb6b: Widen `createPortal`'s `body` type to accept any renderable (an `ElementDescriptor`, host
  element, array, or text) — the runtime has always normalized these (`normalizePortalBody`);
  only the TypeScript signature required a `ComponentBody`. No behavior change.
- 056c441: Custom hooks now work across module boundaries, in plain `.ts`/`.js` and in `.tsx`. A custom hook (any `use[A-Z]` function) defined in a plain `.ts`/`.js` file gets its base octane hooks slotted by a new lightweight, surgical Vite-plugin pass that edits ONLY the hook call sites and leaves every other byte — including TypeScript the full compiler can't print (index signatures, generic type aliases) — verbatim; the `.tsrx`/`.tsx` caller still wraps the call in `withSlot`, so reuse and nested composition keep independent state across the boundary. `.tsx` (TS + JSX) files now go through the full compiler alongside `.tsrx`, so components and hooks authored in `.tsx` work too. The pass only runs on files importing a hook from `octane`, skips `node_modules` (published bindings ship pre-slotted), and honors a `// octane-no-slot` opt-out plus the plugin's new `exclude` option for hand-written slot-forwarding bindings in a monorepo.
- aa9cc6e: Compiler: support custom hooks and library bindings.

  The compiler now injects a per-call-site slot symbol for any call matching React's
  `use[A-Z]` hook convention — not just the built-in hooks — and passes it as the
  trailing argument. A custom hook is therefore a plain wrapper that **forwards** that
  slot to the base hook it composes (every base hook already accepts an optional trailing
  slot). Because the slot is per-call-site, two calls to the same custom hook in one
  component — `useFoo(a)` and `useFoo(b)` — stay independent, exactly like in React.

  Nested hook calls now resolve too: a hook used as an **argument** to another hook (e.g.
  `useStore(api, useShallow(sel))`, or a hook in a deps array) gets its own slot. Before,
  `rewriteHookCalls` appended the outer slot but did not recurse into the call's arguments,
  so the inner hook was left without one.

  This is what lets hook-based libraries be bound to octane by reimplementing only their
  thin React binding on octane's base hooks (see the new `@octanejs/zustand`).

- 0f57f20: Adopt React's `dangerouslySetInnerHTML={{ __html: … }}` for raw HTML, and stop
  special-casing the `innerHTML` attribute.

  Raw HTML is now set the React way: `<div dangerouslySetInnerHTML={{ __html: markup }} />`.
  The compiler extracts `__html` and uses the existing innerHTML-assignment fast
  path (markerless, only-child) on both the client and the server (SSR emits the raw
  content). Spreads are handled on both sides too — `<div {...props} dangerouslySetInnerHTML={{ __html }} />`
  and a spread that itself carries `dangerouslySetInnerHTML` (the client reads
  `.__html` via the spread/property path; SSR binds each spread once and renders its
  `__html` as the element's content, last-source-wins).

  **Breaking:** the bare `innerHTML={expr}` attribute is no longer treated as raw
  HTML — like React, it's now just an ordinary (inert) attribute. Replace
  `innerHTML={markup}` with `dangerouslySetInnerHTML={{ __html: markup }}`. (The
  `.tsrx` `{html expr}` child directive is unaffected.)

- f44fb6b: React parity: `event.currentTarget` during delegated dispatch is now the element whose
  handler is firing.

  octane delegates events at the root, so the native `currentTarget` was the delegation
  root — while React's synthetic system guarantees each handler sees its OWN element. Ported
  React code leans on this constantly (`event.target === event.currentTarget` self-origin
  guards, `currentTarget`-relative measurement, `indexOf(event.currentTarget)` in list
  navigation — e.g. Radix's RovingFocusGroup). Both the bubble and capture walks now shadow
  `currentTarget` per-handler (a configurable own property) and restore native semantics
  after the dispatch completes.

- 067efa3: `dangerouslySetInnerHTML` now works on the de-opt host path (`createElement`-built elements).

  `createElement('style', { dangerouslySetInnerHTML: { __html } })` (and any other
  element built through the runtime de-opt path rather than compiled JSX) rendered
  empty: props application correctly wrote `el.innerHTML`, but the unconditional child
  reconciliation that followed ran with (empty) `children` and wiped it. Per the React
  contract the two are mutually exclusive — when `dangerouslySetInnerHTML` is present
  the raw HTML owns the element's content, and the de-opt paths (`hostElementBody`,
  including both hydration branches, and the value-position host reconciler) now skip
  child processing entirely. SSR already implemented raw-HTML-wins; this aligns the
  client. Surfaced by Radix ScrollArea's injected `<style>` viewport rules.

- f0c6c4d: Fix de-opt host descriptor refs (`{cond ? <div ref={r}/> : null}` and other value-position
  host JSX) not being detached when the node is removed or its ref changes, leaving `ref.current`
  (or a callback ref) pointing at a node no longer in the DOM.

  `patchDeoptProps` now detaches the previous ref when it is removed or its identity changes (it
  previously relied on `removeDeoptProp`, which intentionally no-ops `ref`), and the de-opt
  removal paths (`clearChildContent` and the list/replace reconcilers) now detach a removed host
  node's ref before dropping it.

- dd24fd5: An unkeyed `{cond ? <Comp/> : null}` in a de-opt children array now unmounts cleanly.

  `deoptItemBody` assumed one item scope "either always holds Blocks or never does" —
  but an unkeyed conditional sits at a stable index key and flips between the Blocks
  path (component) and the pure path (null/text/host). The pure path never tore down
  the Blocks residue: the toggled-off component's DOM and live effects stayed in the
  item range forever. Each path now tears down the other's residue on a switch, firing
  unmount cleanups and clearing DOM (and the reverse pure→component direction clears
  the stale raw node).

- 524939e: Style declarations dropped between renders are now removed on de-opt-patched elements.

  `patchDeoptProps` reused the fresh-element prop applier for `style`, which passes no
  previous value into `setStyle` — so a declaration present in one render's style
  object and absent from the next was never removed from the reused element (Radix
  Slider's thumb kept its pre-measurement `display: none` forever). The patch path
  now threads the real previous style so dropped keys are diffed away.

- e8ee0a8: The runtime de-opt reconciler now creates SVG elements in the correct namespace.
  Previously, an SVG subtree produced at a VALUE position — e.g. `createElement('svg',
…)` / `<svg>…</svg>` returned from a component, rather than a compiled static
  template — was built with `document.createElement`, yielding HTML-namespaced
  `HTMLUnknownElement`s (so `<svg>`/`<path>` didn't render and `clipPath` was
  lowercased to `clippath`).

  `reconcileDeoptNode`/`reconcileDeoptChildren` (and the component-bearing
  `hostElementBody`) now open the SVG namespace at `<svg>` and inherit it through the
  subtree, switching a `foreignObject`'s children back to HTML. Class assignment on the
  de-opt path is also SVG-safe (`setAttribute('class', …)` for SVG, whose `className`
  is a read-only `SVGAnimatedString`). The compiled template path is unchanged.

- b680431: Map JSX-compatible `onDoubleClick` handlers to the native `dblclick` DOM event in both compiled and spread/de-opt event paths, and expose positional `createElement` children on `props.children` for host descriptors as well as components.
- 524939e: Effect drains are now re-entrancy-safe (React parity).

  An effect body that synchronously dispatches a DISCRETE event (e.g. a hidden form
  "bubble input" dispatching `click`) triggers a synchronous flush from the event
  handler — which re-entered `drainPhase` over the same live queue, re-running
  entries the outer walk had already executed. When the re-run effect re-dispatched,
  the recursion was unbounded (a Radix Checkbox inside a `<form onChange>` exploded
  to hundreds of change events and a stack overflow). Each drain now takes ownership
  of its batch up-front (React nulls `rootWithPendingPassiveEffects` before running
  effects — same idea): a re-entrant call sees only effects enqueued during the
  drain, which it runs like React's nested passive flush.

- 7f8dbc0: Layout / insertion / passive effects now fire in React's exact **post-order** commit
  order — a node's descendants run before it, and disjoint subtrees run in tree order.
  Previously octane drained each effect phase by depth (deepest-first globally), which got
  the parent/child relationship right but mis-ordered a shallow node in an EARLIER sibling
  subtree against a deeper node in a LATER one (e.g. `<A/>` then `<Wrap><B/></Wrap>` fired
  B before A because B was deeper). Effects are now tagged with their enqueue sequence and
  drained descendant-before-ancestor via the block tree, falling back to enqueue (tree)
  order for siblings — matching React's commit walk. This matters for any parent effect
  that reads refs/measurements established by an earlier sibling subtree's effects.

  Deferred ref attaches now drain in the same post-order (they previously used the same
  depth sort), so callback/object refs attach child-first and in tree order, consistent
  with the effect phases that read them.

- a13acd1: Transitions now commit entangled Suspense boundaries together (React's atomic-commit
  contract). When a single `startTransition` causes several boundaries to suspend — sibling
  `@try` blocks, or several off-screen component/branch swaps — octane now holds the prior
  content of EVERY boundary until ALL their data is ready, then reveals them in one batch.
  Previously each boundary revealed the moment its own promise resolved, so a transition
  that fanned out to multiple regions could show a half-updated screen mid-transition (one
  region's new content next to another region's stale content).

  Implementation: a data-ready barrier in the runtime (`HELD_TRANSITIONS` / `STAGED_REVEALS`).
  A boundary holding prior content for an in-flight transition stages its reveal as its data
  resolves instead of committing immediately; when every held boundary in the transition is
  data-ready the whole group flushes in one commit. `isPending` stays true until that batch.
  Boundaries that leave the group abnormally (an urgent update superseding the transition, an
  error, or unmounting) are dropped so the rest aren't left waiting. Closes the
  "entangled-transition partial-commit" and "per-swap cross-boundary reveal" divergences.

- 067efa3: `onPointerEnter`/`onPointerLeave`/`onMouseEnter`/`onMouseLeave` now fire.

  The enter/leave event family doesn't bubble, so octane's bubble-phase root
  delegation never received these events — the handlers silently never fired
  (unless the element was the delegation root itself). They are now delegated in
  the capture phase (the same treatment focus/blur already had), but dispatched to
  the **target only**: the browser sends each entered/left element its own event,
  so the focus/blur ancestor walk would double-fire ancestors. This matches both
  native semantics and React (whose enter/leave events don't bubble either).

- 524939e: Event handlers whose body calls a METHOD now work (`onClick={() => obj.method(x)}`).

  The compiler's event-bundle optimization extracted the callee into a stable `fn`
  slot for identity-diffing — but extracting a member callee (`props.log.push`) loses
  its receiver, so the dispatcher's bare `fn(...)` invocation ran the method with
  `this === undefined` and threw mid-dispatch. Bundling is now restricted to plain
  identifier callees (the hot path it was built for); member callees keep the
  ordinary closure handler.

- 894d51c: Two delegated-event fixes:

  - **No double dispatch across nested delegation targets.** A native event that reaches
    more than one delegation listener (a portal target nested inside a root, nested roots,
    or overlapping portal targets) is now walked once — the first listener does the full
    logical-tree walk and the rest no-op. Previously each nested target re-walked the
    shared part of the chain and fired its handlers multiple times.
  - **`onXxxCapture` handlers now work.** Capture-phase handlers (`onClickCapture`,
    `onPointerDownCapture`, …) were compiled to a dead `$$clickcapture` slot plus a
    never-fired `clickcapture` delegated event. They now register a real capture-phase
    delegated listener and fire root→target (React's capture order) before bubble
    handlers. The real `gotpointercapture`/`lostpointercapture` events are handled
    correctly (not mistaken for capture-phase of `gotpointer`).

- 894d51c: `flushSync()` now flushes renders scheduled by the effects it commits. A layout
  effect that calls `setState` (e.g. `useTransitionStatus`'s rAF→`flushSync(setState)`)
  schedules a render while `syncFlush` is set, which previously left that render stranded
  in the queue with no microtask armed — so the update never committed until an unrelated
  update happened to flush it. `flushSync` now hands those effect-scheduled renders to
  the normal async scheduler before returning, so transition/`useTransitionStyles` state
  lands as expected.
- 1960647: `flushSync` now drains convergent `useLayoutEffect` → `setState` cascades synchronously (React parity).

  Previously `flushSync` ran layout effects once, but any re-render a layout effect scheduled
  (by calling a state setter) was deferred to a microtask instead of being flushed before
  `flushSync` returned. React drains these synchronously, so a component whose layout effect
  settles derived state across a couple of passes (e.g. a mount/exit-animation presence gate)
  would be observed mid-cascade right after a `flushSync`.

  `flushSync` now loops render → layout-effects until the queue settles, with **convergence
  detection**: it keeps draining while each pass schedules only blocks not yet rendered in this
  `flushSync` (a finite cascade propagating through the tree), and the moment a block
  re-schedules **itself** a second time it treats the cascade as non-convergent, stops, and
  hands the remainder to the async scheduler — which advances it lazily, one render per
  microtask, exactly as before. This preserves octane's deliberate divergence from React for
  non-convergent cascades (an unstable `useSyncExternalStore` `getSnapshot` returning a fresh
  object every call re-schedules its component from every layout pass — React throws
  "Maximum update depth exceeded" / warns "The result of getSnapshot should be cached";
  octane neither hangs nor burst-renders). A count backstop (50) additionally bounds
  pathological wide-but-finite chains. Passive (`useEffect`) effects stay post-paint,
  except that pending passives flush before each new render wave (see the
  passive-before-render changeset).

- e8ee0a8: `onFocus` / `onBlur` handlers now fire. They were treated as delegated events but the
  single root listener was attached in the bubbling phase — and `focus`/`blur` don't
  bubble, so the handlers never ran. They are now delegated in the **capture** phase, so
  the dispatcher (which walks from `event.target` upward) reproduces React's bubbling
  `onFocus`/`onBlur` semantics (the target handler fires, then each ancestor's). Other
  event types keep the cheaper bubbling-phase delegation. This is what lets focus-driven
  UI — e.g. a focus trap's guards — work.
- 93e2733: Return-JSX (and `@{}`) host elements containing control-flow directives — `@if`, `@for`, `@switch`, `@try` — now fold into the return-based fragment model. The directive's branch/item/case/try bodies are compiled inside the component (preserving their closure over setup locals/props), and the control inputs (condition, items, discriminant + cases array, branch/item/case/try/catch/pending functions, dep-pure deps) thread into the hoisted renderer as `props.hN` holes; the `@for` key function stays module-hoisted. The folded output is byte-identical to the inline form on the client, SSRs identically, and hydrates by adopting the server markup (verified for each directive incl. keyed reconciliation and the error-boundary path). This is the directive groundwork for collapsing `@{}` and `return <jsx>` onto one component model.
- 149800c: Fix effect/ref cleanup leak on the keyed-list batch-clear fast path.

  Clearing a keyed `@for` list (or replacing every key at once) tears down items through
  `batchClearItems`, which previously fired only each item scope's own `cleanups` and
  `children` — gated behind a `hasCleanups` flag that only `useEffect` registration set.
  Cross-module component rows (a `componentSlot` stashed on the item's `_slots`, not
  `.children`) never had their effect cleanups fired, cleanup-returning callback refs
  leaked whenever the row had no effects, and portal content in foreign targets was left
  in the DOM. Items now dispose through the full `unmountBlock(b, false)` scope walk
  (slots, portals, trySlot bookkeeping) whenever they carry any teardown work, with plain
  template rows keeping the cheap fast path. The scattered per-item removal path was
  always correct; only bulk clear/replace leaked. Teardown walks also now traverse the
  intrusive item chain (`head` → `nextSibling`) instead of the keyed Map's iterator.

- 6983478: `@for` DEP-PURE deps compare with `Object.is` (NaN-safe), like hook deps.

  The reconciler's deps-snapshot compare used strict `!==`, so a NaN dep permanently
  defeated the pure promotion (survivor bodies re-ran on every render) and ±0 behaved
  differently from the hook-side `depsChanged`. Both paths now share `Object.is`
  semantics.

- 6983478: Compiler: a valueless `key` attribute inside `@for` no longer crashes the compile.

  `@for (…) { <li key>…</li> }` hit a TypeError dereferencing the missing
  attribute value in the legacy key-attribute extraction. A bare `key` carries no
  expression, so it is now skipped (matching the component-slot `key` handling)
  and the `@for` falls back to the header key / index / `x.id ?? x` default.

- 6983478: `<form action>` toggling function → string → function re-wires submit interception.

  Switching a form's action from a function to a string cleared the intercepting
  `$$submit` handler but left the wired-once guard set, so flipping back to a function
  action skipped the re-wire and submit interception was permanently dead for that
  form. The guard is now reset alongside the handler.

- 169c7c6: Three hook fixes:

  - **`useDeferredValue`** now compares with `Object.is` instead of `===`/`!==`. `NaN` no
    longer schedules a deferred re-render every tick (it used to never settle), and a
    `-0`/`+0` change is now detected.
  - **`useImperativeHandle`** now re-attaches when the `ref` identity changes even if `deps`
    are stable (e.g. `[]`). A swapped ref previously left the old ref populated and the new
    ref unset; now the old ref is cleared and the new one is populated.
  - **`useCallback(fn)`** with no deps inside a custom hook is no longer brittle. It used to
    pre-resolve the slot and forward it to `useMemo`, which (in a custom-hook path context)
    defeated `useMemo`'s own omitted-deps reinterpret and let the trailing slot Symbol be
    treated as a deps array — caching a stale callback. It now reinterprets the omitted-deps
    form itself and forwards the raw slot so `useMemo` resolves it exactly once.

- bbc3275: Hooks now work in any function, not just components. A custom hook (a plain `use[A-Z]` function) defined in a `.tsrx` module gets its base hooks slotted — previously it threw "useState was called without a slot symbol". Base hooks keep their per-call-site trailing slot; custom-hook calls are wrapped in `withSlot` so the SAME custom hook reused at two call sites (or composed inside another custom hook) keeps independent state. The runtime combines a base hook's own slot with the call-site path stack, so this composes without changing existing component or library-binding behavior.
- ed6afad: Add two runtime primitives for plain-TS (non-template) component bindings:

  - `hostComponent` — render a host element (`<tag>`) that WRAPS a children render-body, with reactive props (className / style / events / ref) and the children rendered inside it via `childSlot`. The runtime counterpart of the compiled `<tag …>{children}</tag>` emission, for runtime-proxy host components (e.g. a `motion.div` factory). The wrapped children render-body is a fresh closure each parent render, so `hostComponent` hands `childSlot` a stable delegating body — without it a control-flow child (`@for`/`@if`) re-mounts and DOM-duplicates instead of reconciling on re-render.
  - `provideContext(scope, context, value)` — programmatically provide a context value for a scope's descendants (the same stamping `<Context.Provider>` performs), so a plain-TS component that renders children can provide context without authoring a `.tsrx` Provider wrapper.

  Both are used by the new `@octanejs/motion` (`motion.div`, `MotionConfig`, variant propagation).

- 40bcb16: Fix `hostComponent` (the primitive behind @octanejs/motion's `motion.<tag>`) leaving stale
  props on its reused element and mis-handling capture-phase events:

  - It now DIFFS against the previous render's props and removes any attribute, class, style,
    event handler, or ref that disappeared — instead of only ever applying the current props (so
    a prop present last render but absent now no longer lingers on the element).
  - Events now go through `eventSlot` rather than a hand-rolled `on<Upper>` parse, so
    `onClickCapture` registers a real capture-phase listener (`$$capture:click` + a capture-phase
    delegated listener) instead of a dead `$$clickcapture` slot on a never-fired `clickcapture`
    event.

- c842fb7: Smaller text-hole mount codegen: fold the value coercion into `htext`/`htextSwap`.

  A text-hole mount previously emitted the coercion inline at every call site —
  `htext(el, _v == null || _v === false ? '' : String(_v))`. `htext`/`htextSwap`
  now coerce the value themselves (the same coercion `setText` already does), so the
  compiler emits a bare `htext(el, _v)` / `htextSwap(pos, _v)`. The coercion runs
  exactly where it did (mount-once, never the hot update path), so it's
  runtime-neutral and byte-identical output — just less generated code per text hole
  (~240 fewer chars on the dbmon component, scaling with text-hole count).

- c62efa7: Fix a crash (`Cannot read properties of null (reading 'parentNode')`) when a template
  interleaves sibling text holes with component or control-flow holes — e.g. a metadata row
  like `{score} <Link/> {time} <Link/>`.

  A sibling-position `{x as string}` text hole mounts via `htextSwap`, which replaces its `<!>`
  placeholder with a text node, DETACHING the placeholder. The compiler was emitting that mount
  before later element walks that navigate _from_ the placeholder (`sibling(_el, n)` for the next
  text hole AND for the following component/control-flow anchors), so those walks read a detached
  node, returned `null`, and `htextSwap(null)` threw. The compiler now defers sibling-text-hole
  mounts until after every element walk is emitted, so all navigation happens on the intact
  template.

- 524939e: `htmlFor` now writes the native `for` attribute (React parity, like `className`).

  Previously it produced a dead `htmlfor` attribute. Aliased everywhere an attribute
  can be written: the compiler's static template emission, the runtime's dynamic
  `setAttribute`/de-opt paths, and SSR serialization.

- b3a9191: Rename `hydrate` → `hydrateRoot` and adopt React 18's shape. The hydration entry is now `hydrateRoot(container, <App/>)` — container first — and returns a full `Root` (with `.render()` and `.unmount()`), symmetric with `createRoot`. Previously `hydrate(Component, container, props)` put the component first and returned only `{ unmount }`. After hydration the returned root's `.render()` performs a normal client update against the adopted DOM (no re-hydration). The vite-plugin's generated client entry now imports and calls `hydrateRoot`.
- ffe32c4: Fix five hydration mismatch recovery bugs surfaced by porting React's hydration diff matrix
  (`ReactDOMHydrationDiff-test.js` + `ReactDOMServerIntegrationReconnecting-test.js`) as
  conformance tests:

  - **`clone()` corrupted the enclosing range on a client-only branch.** When the server left a
    slot empty (e.g. a client-only `@if` branch) the cursor sits on the block's close marker;
    the structural-rebuild path removed it, breaking the parent range (the whole subtree could
    vanish). It now builds fresh and consumes nothing in that case.
  - **`ifBlock`/`switchBlock` read a stale cursor for an empty server branch.** The
    "borrow markers" path (hit when the server branch had no inner markers, i.e. was empty)
    never positioned the hydration cursor, so a non-empty _client_ branch mis-adopted. It now
    parks the cursor on the slot content.
  - **`ifBlock`/`switchBlock` left server content behind for an empty client branch.** When the
    client branch renders nothing but the server rendered content, the stale server range is now
    discarded so siblings stay aligned.
  - **`setStyle` did not detect inline-style hydration mismatches.** It now warns (dev) on a
    server/client style divergence and honors `suppressHydrationWarning`, matching the
    text/attribute paths.
  - **`setClassName` did not detect `class` hydration mismatches.** Same treatment: dev warning
    - `suppressHydrationWarning` support (previously `class` mismatches were silently patched).

  All recovery runs in dev + production; warnings remain dev-only and gated, so production output
  is unchanged.

- e1f996b: Add React-shaped hydration mismatch detection + recovery, with `suppressHydrationWarning`
  and dev-only source-location attribution. Previously `hydrateRoot` adopted the server DOM
  blindly, so any server/client divergence silently produced broken DOM (and a list-grow
  mismatch could crash). Now:

  - **Value mismatch (text / attribute):** the adopted node is patched to the client value
    (`htext`/`htextSwap`/`childTextHole`/`setAttribute`).
  - **`suppressHydrationWarning`:** React shallow semantics — keeps the server value and
    suppresses the warning for that element. It is never serialized to the server HTML.
  - **Structural mismatch:** a swapped `@if`/`@switch` branch (including same-tag branches
    that differ only by a static attribute or by nested static markup), a changed tag, a
    host↔component swap, or a changed `@for` length (longer, shorter, or toggled to/from the
    `@empty` arm) is detected and the affected subtree is rebuilt on the client (the stale
    server nodes are discarded and the hydration cursor stays aligned, so following siblings
    still adopt correctly).
  - **Dev DX:** mismatch warnings include a Svelte-5-style source location
    (`App.tsrx:42:5`), surfaced via a new dev-only `dev` compiler option.

  Recovery runs in development and production; the warnings and source-location metadata are
  development-only and strictly gated, so production output is byte-identical (zero cost).

- 6983478: Structural hydration recovery at template roots now runs in production builds.

  `clone()`'s structural mismatch check (swapped `@if`/`@switch` branch, changed tag)
  was gated on the dev-only source-loc argument, so prod builds silently adopted the
  wrong server subtree with no rebuild — contradicting the documented contract that
  only the WARNING is dev-only. Detection + rebuild now run unconditionally (synthetic
  multi-root template wrappers, which have no 1:1 server node, are stamped by
  `template()` and skipped); the warning stays dev-gated.

- fc36e15: Fix `innerHTML={expr}` rendering as a dead lowercased `innerhtml` attribute (and an
  empty element) when the element also carries a spread, e.g.
  `<div {...stylex.props(x)} innerHTML={html} />`. With a spread the dedicated
  html-child fast path can't be used and the binding is routed through `setAttribute`,
  which now correctly assigns the `innerHTML` property instead of adding an attribute.
- 524939e: `onInvalid` now fires, on the control and its ancestors (React parity).

  The native `invalid` event doesn't bubble, so octane's bubble-phase root delegation
  never received it. It is now capture-delegated with the focus/blur ancestor walk —
  matching React, where a form's `onInvalid` observes its controls' invalid events
  (Radix Form relies on this to focus the first invalid control and suppress the
  browser's validation bubbles).

- 405f06e: Fix React-style `.tsx` (JSX) rendering of `Context.Provider` children and of host elements with component children.

  - `<SomeContext.Provider value={…}>…</SomeContext.Provider>` authored in `.tsx` now renders its children. Previously the built-in Provider only ran a `.tsrx`-style render-function child and silently ignored an element-descriptor child (the shape a React-style parent produces via `createElement`), so the whole subtree under the Provider rendered nothing.
  - A host element with component children produced via `createElement` from a control-flow return — e.g. a component that returns `<div><Child/><Child/></div>` from inside an `if`, so the compiler emits the de-opt path instead of a static template — now renders, and its component children mount as real Blocks that **reconcile** across re-renders (their state/hooks are preserved) and unmount cleanly. Previously this threw "rendering a component on the de-opt path is not supported".
  - The de-opt path now **reconciles host elements in place** (reuses the DOM node, diffs props, matches children by key/position) instead of rebuilding them every render. This was a correctness bug, not just a perf issue: rebuilding destroyed DOM-resident state — an `<input>`'s value, focus, selection, scroll position, media playback — whenever a parent re-rendered. Host nodes (and their per-item nodes in a `{items.map(...)}` list) now keep their identity across re-renders, and adopt the server DOM on hydration.
  - Positional component children (`<div><A/><B/></div>`, which `createElement` collapses into an array) no longer emit the "each element should have a unique key" warning — those are fixed siblings that never reorder, so they're keyed by index silently. A real `.map()` without keys still warns.

  Together these let deeply-recursive, control-flow-driven component trees with Context (the shape React-style code commonly uses) render through octane's JSX backwards-compat path with correct DOM-state preservation. Also fixes a latent teardown gap where an array-valued `{expr}` child slot (`{items.map(...)}`) did not fire its items' cleanups on unmount.

- f50c829: Compile `{items.map(item => <jsx key={…}/>)}` keyed lists to the same `forBlock`
  fast path as `@for`, instead of the de-opt descriptor/childSlot path.

  A React-style `.tsx` `.map(...)` (and a `.tsx`/`.tsrx` `.map` written in value
  position) previously built a `createElement(...)` descriptor for every row on
  every render and reconciled that array through `childSlot`/`reconcileKeyed`. It
  now lowers — on both the client (`forBlock`) and the server (`ssrBlock`) — to a
  compiled per-item body run over the raw items array, with the `key={…}` attribute
  becoming the keyed reconciler's key function. The eager per-row descriptor
  allocation is gone, the row body diffs per-binding, and server + client emit
  matching markers so the list hydrates by adoption.

  Lowered when the callback is an expression-body arrow returning a single JSX
  element: `xs.map((item) => <el key={…}>…)` and `xs.map((item, index) => …)`
  (destructured item params and the index param are supported). A block-body arrow,
  a fragment/non-element return, or a non-arrow callback keep the previous childSlot
  path. No authoring change and no behavioral change — keyed reconcile identity and
  DOM-resident state are preserved (covered by new `.tsx` `.map` reorder + hydration
  tests); it's a substantial update-throughput win for keyed lists authored with
  `.map` (e.g. the dbmon benchmark's full-table tick roughly halved).

- b3a9191: Text holes no longer require an `as string` cast when the compiler can already see the value is a string. A `{expr}` hole is classified as text (rather than a renderable child) when `expr` is a string or template literal, a `+`-concatenation involving a string (e.g. `{'Count: ' + count}`), or a local `const`/param the compiler tracks back to a string (a provably-string initializer or a `: string` annotation). The classification runs identically on the server and client compile paths, so SSR markup and hydration stay in lockstep. Names a render scope re-binds (e.g. a `@for` loop variable) are excluded from tracking so they're never misclassified.
- dd24fd5: `memo()` now bails for components rendered at value positions, with React's lazy context propagation.

  The React.memo bail lived only in `componentSlot` (compiled component positions) — a
  memo'd component rendered as value-position children (context-provider children,
  `createElement` trees in bindings) re-rendered unconditionally, and the
  context-refresh walk missed consumers under a childSlot in ARRAY mode (its keyed list
  lives in an embedded forSlot). Both same-component update paths now share the bail:
  stable props skip the body, and only consumers of a CHANGED context re-render below
  the bailed boundary (React's `['App','Consumer']` — no 'Indirection'). This is the
  building block for expressing React's implicit same-element bailout in octane
  bindings (e.g. Radix NavigationMenu's convergence).

- 7042056: Internal: store a scope's binding bag and control-flow / component / child slots in a per-scope dense `slots` array indexed by a compile-time slot index, instead of dynamic `scope["_for$N"]` string-key own-properties.

  Previously each compiled body stamped its bindings (`b$N`) and slot states (`_for$N`, `_if$N`, `_comp$N`, …) directly on the scope as string-keyed own-properties, which made the Scope/Block hidden class polymorphic across components and turned slot access into a computed-key lookup. They now live in `scope.slots[i]` (bag at index 0), so the scope object shape is monomorphic and slot access is an array index.

  - Slot indices are assigned in execution (source-id) order, so each scope's `slots` array is written front-to-back and stays packed (not a holey/dictionary-mode array).
  - `headBlock` (the `<title>`/`<meta>`/`<link>`→`<head>` hoisting) and `hostComponent` (the runtime host-with-children proxy used by `@octanejs/motion`) were the last helpers stamping `(scope as any)[key]`; both now use the `slots` array, so there are **no** remaining dynamic scope-key stamps. `headBlock` and `hostComponent` gained a leading numeric slot argument (internal/advanced APIs; `headBlock` keeps the content key for SSR adoption).
  - The `[key: string]: any` escape hatch is removed from `Scope`/`ScopeImpl`/`BlockImpl` and the interfaces are fully typed.

  No public component-API or behavior change; compiled `.tsrx`/`.tsx` output format changed (regenerate any committed build output).

- 6983478: Compiler: fix top-level control-flow placement in multi-root bodies.

  - **Constructs between static roots now render at their source position.** A
    top-level `@if`/`@for`/`@switch`/`@try`/`<Activity>` in a multi-root
    (fragment-root) body used to be appended at the end of the block — after
    later static siblings — and, worse, still advanced the template child index,
    so any BOUND static sibling after the construct resolved the wrong template
    path and crashed the mount walk. Such constructs now emit a `<!>` anchor at
    their child index (exactly like the in-element mixed-children path) and the
    child index only advances for nodes that actually contribute template HTML.
  - **Control-flow-only bodies anchor at the block end marker.** A component
    whose body is ONLY a `@for`/`@switch`/`@try` rendered its content outside the
    component's block range (after later siblings of the component) because the
    `__block.endMarker` fallback existed only on the `@if`/component emit paths.
    The anchor selection is now one shared helper across all construct emits, so
    the fallback applies uniformly and the emit sites can't drift again.

- e031a7d: Smaller template codegen: stop duplicating property-write bindings across the
  mount and update branches.

  A `class` / `attr` / `style` / `formAction` / `dangerouslySetInnerHTML` binding
  used to emit its write twice — once unconditionally in the mount branch
  (`setClassName(_el, _v)`) and once as a guarded diff in the update branch. The
  mount now only stores the element ref + seeds the diff field; a single diff runs on
  every render and performs the write, firing on the first render via the `undefined`
  seed (and `setClassName(el, undefined)` / `setAttribute(el, name, undefined)` no-op
  on a freshly-cloned element, so output is byte-identical). Elements carrying a
  spread are left untouched — a spread can write any key, so its source-order
  position and commit-phase ref timing are preserved. Runtime-neutral; the dbmon
  component (6 class bindings) shrinks ~12%, on top of the text-hole and
  sibling-navigation reductions (~20% combined).

- 86ae0c5: React parity: numeric `style` object values now get `px` appended.

  A bare number given to a style property is coerced the way React does — `style={{ width: 100 }}`
  now produces `width: 100px` instead of the invalid `width: 100`. The known **unitless**
  properties (`opacity`, `zIndex`, `lineHeight`, `flex`, `gridRow`, `strokeWidth`, …, plus their
  vendor-prefixed variants) stay raw, `0` never gets a unit, and custom properties (`--x`) are
  left untouched. String values are unchanged.

  The rule is applied consistently everywhere a style object is realized — the dynamic runtime
  path (`setStyle`), server rendering (`ssrStyle`), and the compiler's static-object bake — so
  static and dynamic styles agree and SSR hydrates without a mismatch. The static bake also now
  hyphenates camelCase keys (`fontSize` → `font-size`), matching the runtime.

- a33cdd6: Ship a built package to npm (JS + type declarations) instead of raw TypeScript source.

  Previously `octane`'s `main`/`module`/`types`/`exports` pointed at `src/*.ts`, so the
  published tarball contained raw `.ts` — which a plain Node SSR server or any consumer that
  doesn't transpile `node_modules` could not import.

  - A new build (`pnpm --filter octane build`, run automatically from `prepack`) transpiles the
    runtime to ESM `.js` + emits `.d.ts`, and copies the already-JS compiler, into `dist/`.
  - `publishConfig` repoints `main`/`module`/`types`/`exports` at `dist/` **only when
    published** — the workspace, tests, and examples keep importing `./src` directly, so local
    dev needs no build step.
  - Relative imports in the runtime now carry explicit `.js` extensions, so the emitted JS and
    declarations resolve under Node ESM and `node16`/`nodenext` consumers (not just bundlers).

  The published package now loads in plain Node ESM with no transpiler. No API or behavior change.

- 067efa3: Pending passive effects now flush before the next render pass begins (React parity).

  React flushes pending `useEffect` work at the start of any new render
  (`flushPassiveEffects`-at-render-start), so a commit's passive effects are
  guaranteed to observe the world **before** a follow-up render mutates it. Octane
  deferred all passives to post-paint unconditionally, so when a layout effect
  scheduled a follow-up render (a Presence-style reveal: commit #1 flips `open`,
  a layout effect flips local state, commit #2 mounts the revealed children), both
  commits' passive effects merged into one post-paint drain and ran child-first —
  letting a freshly-mounted child's effect observe an event announcing its own
  mount. Real-world symptom: Radix Tooltip self-closed immediately on open (its
  content's `TOOLTIP_OPEN` document listener heard the open dispatch from its own
  root).

  Both the async scheduler and `flushSync`'s layout-cascade convergence loop now
  drain pending passive effects before starting a render wave, matching React's
  observable ordering: an earlier commit's passive dispatch fires while later-
  commit children do not exist yet.

- fab1cb0: `createPortal(...)` now renders as an ordinary renderable VALUE — at any position,
  not only as a direct `{createPortal(...)}` child of a host element. Returning a
  portal from a component (`return createPortal(...)`), placing one in a ternary
  (`{cond ? createPortal(...) : null}`), at a fragment root (`<>{createPortal(...)}</>`),
  in an array (`useDecorators`-style), or from a render function all work now. A custom
  portal body may be a component (`createPortal(Comp, target, props)`) or inline JSX
  (`createPortal(<Comp/>, target)`). The host-element-child form keeps its lowered
  fast path; everything else routes through the de-opt `childSlot`, which renders the
  `PortalDescriptor`, flows context, and tears down cleanly (no orphan markers).

  Also fixes a latent bug in the return-value render path: a component whose `return`
  flips between a single-root component (the markerless `componentSlot` path) and
  `null` / a portal / an array (the `childSlot` path) — e.g. a placeholder toggling on
  and off, or a typeahead menu opening and closing — corrupted its return slot and
  crashed. The slot is now disposed when its shape changes, so it rebuilds cleanly.

- 6983478: Value-position portals: context propagation under memo bails + text-mode flips.

  Two gaps for a `createPortal(...)` living in a childSlot (a component return,
  ternary, fragment root, or render-fn result): a memo boundary that bailed on equal
  props never refreshed context consumers INSIDE the portal (the content Block lives in
  the slot's embedded PortalSlot, which `refreshContextConsumers` didn't walk — it now
  has a portal arm, like the array arm); and `textSlot`'s primitive hot path didn't
  recognize a portal-mode slot, so flipping the hole from a portal to a string wrote
  the text but left the portal's foreign-target content mounted forever. The
  mode-switch guard now routes portal-mode slots through the full classifier, which
  tears the portal down.

- dd24fd5: `createPortal` content targeting an octane-managed element now survives the owner's re-renders.

  The raw de-opt reconciler assumed full ownership of its element's live children — a
  portal's whole `<!--portal-->…<!--/portal-->` range was removed on the target owner's
  next re-render (Radix Toast portals each toast into the viewport list; every provider
  re-render deleted all toasts). Portal ranges are now tagged and treated as FOREIGN:
  the reconciler's reuse, removal, and reorder passes all skip them, so portal content
  coexists with the container's rendered children exactly like React portals.

- 149800c: Compiler: `createPortal(<div …>…</div>, target)` with an inline JSX element (or
  fragment) body at JSX child position now compiles.

  React's most common portal authoring shape previously printed the raw JSX verbatim
  into the emitted `portal()` call — invalid output reaching the bundler. The inline
  body is now hoisted into a sub-template render fn (the same lowering as an `@if`
  branch body), landing on the same `portal()` fast path as the documented
  `() => @{ … }` arrow form.

- 6983478: Prop removal now mirrors the SET path on every prop-diff loop.

  The three stale-prop removal loops (spread updates, de-opt reconcile, hostComponent
  re-apply) had drifted apart; they now share one `removeHostProp` helper. Fixes folded
  in: a removed `htmlFor` clears the real `for` attribute (previously the raw
  `removeAttribute('htmlFor')` no-op leaked it); a vanished `className` on a de-opt
  element removes the attribute instead of leaving `class=""`; a vanished
  `suppressHydrationWarning` resets the element's suppression flag on the de-opt patch
  path (it was skipped, leaking suppression onto reused elements); and generic removals
  go through `setAttribute(el, name, null)` so aria-\* and namespaced attributes remove
  with the same semantics they were set with.

- cb9ad82: Rename the project from `vyre` to `octane`. The runtime now publishes as `octane` and the Vite metaframework plugin as `@octanejs/vite-plugin`. Identifiers inherited from the Ripple fork were also renamed to Octane (e.g. `setIsRippleActEnvironment` → `setIsOctaneActEnvironment`, the metaframework `ripple()` plugin → `octane()`, and the `ripple.config.ts` convention → `octane.config.ts`). References to the upstream Ripple framework and its `@ripple-ts`/`@tsrx` packages are unchanged.
- ea6352e: The compiler now supports React-style render-prop children — `<Comp>{(data) => <jsx/>}</Comp>`. Previously only the octane `{(data) => @{ … }}` form (a JSXCodeBlock arrow) was lowered; a bare-JSX arrow body left its JSX un-lowered (invalid output), and a function child was always wrapped as a scope-receiving child renderer (so the consumer couldn't call it as `props.children(data)`). Now a component whose sole child is a `(args) => <jsx/>` / `(args) => (<jsx/>)` / `(args) => <>…</>` render-prop has that JSX lowered to `createElement(...)` while the arrow is preserved and passed RAW, so the component can call it with arbitrary args and render the returned descriptor. (Client/`.tsrx` + `.tsx`; render-prop children that return JSX are not yet supported under SSR.)
- 1987bd7: Runtime + SSR micro-optimizations (no behavior change):

  - `escapeHtml`/`escapeAttr` first run a single `.test()` scan and return the
    original string when nothing needs escaping (~5× on clean text, the common
    case); escape-bearing strings keep the native chained replaces.
  - `styleName` hyphenation (camelCase → kebab) is memoized, and `normalizeClass`/
    `styleName` now live once in `css.ts` with both the client runtime and the SSR
    serializer importing them (completing the intended shared-module split; they
    previously carried divergent private copies).
  - `shallowEqualProps` (every memo bail) uses a zero-allocation for-in compare for
    plain-prototype props instead of two `Object.keys` arrays, with the exact
    slow path kept for non-plain objects. React `shallowEqual` semantics preserved.
  - Hydration structural-mismatch diagnostics (`describeHydrationNode` etc.) are
    now constructed only when a dev source-loc exists, so production recovery pays
    only the mismatch check itself.
  - Keyed-list teardown walks the intrusive item chain (`head → nextSibling`)
    instead of allocating Map iterators.
  - `createElement` (client and SSR) no longer strips `key` via `delete` — the
    delete dropped every spread-created props object into V8 dictionary mode,
    slowing all later enumeration over those props (memo compares on
    value-position rows measured ~2× slower because of it). The key is now
    excluded during a manual own-key copy.

- 0c4d5a1: Performance: coalesce overlapping cascades in a batched flush.

  When several components in the same subtree update in one batch, an ancestor's
  re-render already cascades through its descendants — so the scheduler now skips
  re-rendering a queued block that an ancestor's cascade already brought up to date
  this flush, instead of rendering it a second time from the queue. The render
  queue is drained in depth-sorted waves (ancestors first), so this coalescing is
  independent of the order the updates were queued in. For a batch that updates an
  N-deep chain of stateful components, render work drops from O(N²) to O(N) (e.g. a
  10-deep chain: 55 block renders → 10). Behavior is unchanged — every update is
  still applied; only the redundant re-renders are removed. The depth sort runs
  only on batches of more than one block, so single (the common case),
  non-overlapping, and re-entrant updates are unaffected.

- dd24fd5: `onScroll`/`onScrollEnd` now fire (React 17+ per-element semantics).

  Native `scroll` doesn't bubble, so bubble-phase root delegation never received it —
  element scroll handlers silently never fired (Radix Select's expand-on-scroll
  viewport exposed it). `scroll`/`scrollend` are now capture-delegated and dispatched
  to the scrolled element only, matching React 17+, where `onScroll` stopped bubbling
  and ancestors receive their own scroll events natively.

- fcac573: Unify the server-rendering ABI to props-first, matching the client. A component body is now invoked as `(props, scope, extra)` on the server (it used to be `(scope, props, extra)`). This makes a plain `function Foo(props)` used at a `<Foo/>` site work the same on the server as on the client — including components that return a non-JSX value (a primitive coerced to text, an early return, `null`). SSR markup is unchanged (only the invocation order flipped), so hydration is unaffected. The server layout/page wrappers in the vite-plugin were updated to match.
- 41aa22a: Fix the server `createElement` leaking `key` into a component's `props`. The client
  `createElement` lifts `key` out of props (React semantics — `key` is never a real prop), but
  the server returned the original props object with `key` intact, so `ssrChild` spread it into
  the component and a `.tsx` component reading `props.key` saw a value during SSR but `undefined`
  on the client. The server now strips `key` copy-on-write, matching the client.
- c842fb7: Faster + smaller template navigation: chain sibling lookups instead of re-walking
  from the root.

  When a template binds several elements at the same level (e.g. a table row's
  `<td>` cells), the compiler resolved each one with a fresh walk from the parent —
  `_root.firstChild`, `_root.firstChild.nextSibling`,
  `_root.firstChild.nextSibling.nextSibling`, … — which is O(k²) navigation steps for
  k siblings, in both generated code and mount-time DOM walking. `ensureVar` now
  chains off the nearest already-materialized preceding sibling
  (`_el1 = _el0.nextSibling`, `_el2 = _el1.nextSibling`, …), so a row of k cells costs
  O(k) steps. Hole-aware templates chain via `sibling(node, n)` (still skipping
  control-flow `<!--[-->…<!--]-->` ranges as one logical step), so hydration is
  unchanged and output stays byte-identical. On the dbmon fixture's 7-cell row this
  trims the compiled component ~5% and speeds the 1,000-row mount ~11%.

- 6983478: Spread props now hydrate like direct bindings: `suppressHydrationWarning` and `class`.

  A spread-supplied `suppressHydrationWarning` was written as a literal
  `suppresshydrationwarning=""` DOM attribute — itself a guaranteed server/client
  divergence, since SSR skips the key — and never armed the suppression. `setSpread` now
  stamps the JS flag (before the other keys apply, so it's order-independent) exactly
  like the compiler's direct-attribute binding and the de-opt paths. The spread `class`
  fast path also bypassed hydration handling; it now routes through the hydration-aware
  attribute class setter, so spread and SVG/MathML classes get the same
  suppress/warn-and-patch semantics as an HTML `className` binding.

- 6983478: SSR: drop function-valued `action`/`formAction` instead of serialising the source.

  A React 19 function action — `<form action={fn}>`, `<button formAction={fn}>`,
  `<input formAction={fn}>` — is submit wiring for the client's `setFormAction`,
  not a URL. The server emitter used to serialise the function's source text into
  the HTML attribute, leaving pre-hydration markup with function source as a
  navigable action. It now drops function values (mirroring the client's tag+name
  condition); string values still serialise, under the native lowercase
  `formaction` name the client also uses.

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

- 149800c: SSR: `render()` now normalizes a root component that returns a `createElement`
  descriptor.

  A plain-`.ts` root (the shape every `@octanejs/*` binding produces) returns a
  descriptor rather than a compiled HTML string; `render()` previously used the return
  value as the body directly, yielding `[object Object]`. The root's return is now routed
  through `ssrChild` exactly like `ssrComponent` already does for child components —
  descriptor trees, component descriptors, and `null` roots all render correctly.

- aafaaa9: SSR: support the router `Match` boundary shape (`@try { <Component/> } @pending { … }`) end-to-end.

  - `octane/server` now exports `withSlot` and `startTransition`. A server build of a `.tsrx` that defines/uses a custom hook (whose inner hook calls the compiler lowers through `withSlot`) or calls `startTransition` — exactly what the `@octanejs/tanstack-router` bindings emit — previously failed to resolve those imports from `octane/server`. The server `withSlot` invokes the wrapped hook with its args (no per-call-site slot tracking is needed in a single synchronous render pass); the server `startTransition` runs its callback synchronously, matching the existing server no-op transition hooks.
  - Hydration of a `@try`/Suspense boundary whose success-arm body is a COMPONENT (the router `Match` shape) now ADOPTS the server DOM instead of throwing. The component-block adoption paths (`componentSlot`, `componentSlotLite`, `forBlock`) now adopt the server's `<!--[-->…<!--]-->` range from the parked hydration cursor when the slot is the sole hole of a control-flow arm — so its anchor is the arm's end marker rather than a block-open — mirroring the cursor-based adopt branch `childSlot` already had. Previously the cursor stayed parked on the component's open marker, so the inner mount cloned a comment node and dereferenced `firstChild`/`appendChild` on it (`TypeError`/`DOMException`), forcing the boundary to its `@catch`/rebuild path.

- 1987bd7: SSR Suspense: collapse the per-pass full-tree re-render for waterfalls.

  `render()` used to re-render the WHOLE tree once per suspense pass, so a D-level
  `use(thenable)` waterfall cost D+1 full-tree serializations — O(tree × D), which
  re-serialized all the static page bulk on every pass. It now records a discovery
  job for the innermost suspending COMPONENT and re-renders only that subtree
  between the (few) canonical full passes, so a deep waterfall costs ~2 full passes
  plus D cheap subtree re-runs. The emitted HTML, `<head>`, scoped CSS, hydration
  markers, and suspense seed order all still come from a single normal full pass, so
  output and hydration are byte-identical; `use()` keys are now scoped to the
  enclosing component frame (internal only — the client still seeds by cursor). The
  no-suspense fast path is unchanged. On the SSR throughput waterfall bench the D=4
  render dropped from ~0.104ms to ~0.049ms (depth-4-vs-1 scaling 2.6x → 1.15x), and
  32-in-flight concurrent throughput roughly doubled, while a shallow (D=1) render
  and no-suspense pages are unchanged. Deep waterfalls also stop re-firing shallow
  `use(fetch(...))` thenable creators on every pass.

- 74cbff9: SSR + hydration: render and hydrate a full app (deeply nested providers, a fragment-returning component with an empty child, and the router `Match` boundary shape) without a cursor desync. Fixes a family of bugs where the server and client serialized the SAME component tree to a different `<!--[-->…<!--]-->` block structure, so hydration adopted the wrong server node and a descendant boundary threw `TypeError: el.setAttribute is not a function` (the boundary then rebuilt, doubling the DOM).

  Compiler:

  - `.tsx` value-position component children now serialize as `createElement(...)` DESCRIPTORS on the server, matching the client. A React-style `return <Provider><Child/></Provider>` body lowered `Child` to a `__schildren` render-fn server-side (which `ssrChild` wraps in its own block) but to a `createElement` descriptor client-side (one block) — one block deeper on the server. `@{}` (template-position) bodies keep the render-fn on both sides.
  - Appended children (fragment children / a control-flow-only body, all anchored at the block end marker) emit in SOURCE order. They were grouped by type (for → if → component), so e.g. `<><Foo/> @if{…}</>` ran the `@if` before `<Foo/>` — reversing DOM order vs the source-order server output and desyncing hydration.
  - Nested JSX inside a server `{cond && <jsx/>}` child hole and inside a server component prop (e.g. `fallback={(e) => <Fallback/>}`) now lowers to `createElement(...)` instead of leaking raw, unparseable JSX into the emitted server module.

  Runtime:

  - `octane/server` now exports the `Suspense` and `ErrorBoundary` JSX built-ins (the component forms of `@try`/`@pending`/`@catch`), so authors writing `.tsx` Suspense/error boundaries can server-render them.
  - `childSlot` no longer sweeps the adopted server DOM when first rendering a component descriptor during hydration (it was deleting the very nodes it was about to adopt, stranding the cursor).
  - `componentSlot` / `childSlot` advance the hydration cursor past a component's adopted range after rendering, so a following sibling adopts the right node — fixes an EMPTY component (`<></>`, e.g. a render-nothing effect component) leaving the cursor on its own close marker.
  - `tryBlock` / `ifBlock` adopt the server range from the parked cursor when they are the SOLE hole of an enclosing scope (so their anchor is the scope's end marker, not a block-open), via a shared `resolveHydrationOpen` helper — the same dual-branch logic `componentSlot` already had.

- 894d51c: SSR + hydration now work for `.tsx` `<Context.Provider>` and de-opt host subtrees:

  - The server `Provider` only rendered children when they were a render function (the
    `.tsrx` shape); a React-style `createElement(Provider, {}, <child/>)` passes a
    descriptor, which was silently dropped — direct-JSX provider SSR rendered empty. It
    now renders descriptor / array / primitive children too.
  - `ssrComponent` now normalizes a component body that RETURNS a `createElement`
    descriptor (the de-opt return path) instead of stringifying it to `[object Object]`.
  - A de-opt HOST element whose children contain COMPONENTS (`<div><Comp/><Comp/></div>`
    returned via the de-opt path) now hydrates without mismatch: the client
    `hostElementBody` adopts the server host node instead of building a fresh one, and the
    server emits the matching `childSlot`/`forSlot`/component block nesting
    (`ssrDeoptBlockChildren`).

- 0040cad: SSR now renders value-position JSX. React-style render-prop children that return
  JSX (`<Comp>{(data) => <span>{data as string}</span>}</Comp>`), `{xs.map(x => <li>{x as string}</li>)}`,
  and render-props returning a fragment now server-render instead of throwing the
  `ssrUnsupported` error. The compiler lowers the JSX to `createElement(...)` host
  descriptors (a new server `createElement` mirrors the client's), and `ssrChild`
  serializes them — a host descriptor to `<tag …>…</tag>` (void-element aware), an
  array to one hydration block per item, and a component descriptor through
  `ssrComponent` (children preserved). The output hydrates cleanly: the de-opt
  `childSlot` array path no longer sweeps the server-rendered item ranges before
  adopting them.
- a3dce2f: A Suspense / `@try`/`@pending` boundary that re-suspends after resolving no
  longer leaves the `@pending` fallback stuck alongside the resolved content.
  When a boundary that was already showing its `@pending` fallback re-suspended on
  a DIFFERENT thenable (e.g. two consecutive `useSuspenseQuery` calls on the same
  route boundary), the runtime mounted a second fallback without tearing down the
  first; once the second thenable resolved, the content mounted but a stale
  fallback remained in the DOM next to it. The boundary now unmounts the prior
  `@pending` body (removing its DOM exactly once) before mounting the new one, so a
  re-suspend while pending REPLACES rather than STACKS the fallback, and the
  fallback is gone once the content commits.
- 3656e32: Suspense now matches React's effect lifecycle: when an already-committed boundary
  RE-SUSPENDS (its content is hidden behind the fallback), the hidden subtree's layout
  and passive effects are DESTROYED (their cleanups run), and they are RECREATED when the
  content reveals again. Previously octane's suspend hold preserved the subtree's effects,
  so a suspended component's subscriptions/timers/observers kept running while the fallback
  was shown. Component state (useState/useMemo/useRef) is still preserved across the
  suspend — only effects destroy/recreate, exactly like React.

  Effects are also destroyed exactly ONCE when a boundary suspends in multiple places
  (a partial resolve that leaves it suspended does not re-destroy or recreate them), and a
  nested inner-boundary re-suspend destroys only the inner subtree's effects, not the
  outer boundary's.

  Implementation: the suspend-hide paths run the hidden subtree's cleanups via
  `deactivateScope` (clearing effect deps so they re-fire on reveal) and mark the hidden
  tryBlock `inactive` so a re-suspend during a resume doesn't leave its enqueued effects
  stuck; the resume retry now commits effects on both the reveal and re-suspend paths
  (this also fixes a latent issue where a resume's layout effects weren't committed until a
  later flush, leaving the scheduler non-quiescent). Per `ReactSuspenseEffectsSemantics-test.js`.

- 43d940d: Add `<Suspense>` and `<ErrorBoundary>` components — JSX forms of the `@try`/`@pending` and `@try`/`@catch` directives, for authors writing JSX rather than the template control-flow (e.g. porting React / TanStack Query code).

  - `<Suspense fallback={…}>…</Suspense>` shows `fallback` while a descendant suspends (via `use(thenable)`), then the children once resolved.
  - `<ErrorBoundary fallback={…}>…</ErrorBoundary>` swaps to `fallback` when a descendant throws; `fallback` may be a renderable or a `(error, reset) => renderable` render prop.

  Both are thin built-ins over the same `tryBlock` primitive the directives compile to, so behavior is identical.

  Also: inline JSX in a component prop value (e.g. `<Suspense fallback={<Spinner/>}>`) now lowers to `createElement(...)` instead of emitting raw, unprintable JSX.

- a032c5c: Fix `block.body is not a function` when `<Suspense>` or `<ErrorBoundary>` is used
  with element children in React-style `.tsx` value position (e.g. inside `.map`,
  as in a list of independently-suspending rows). These built-ins render their
  children as the try body, which the runtime invokes as a function; `.tsrx` lowers
  children to a render function, but a `.tsx` parent lowers element children to a
  `createElement` descriptor. The runtime now normalizes either shape to a callable
  body, so JSX like `{items.map((id) => <Suspense fallback={…}><Row id={id}/></Suspense>)}`
  renders identically whether authored in `.tsrx` or `.tsx`.
- 7f8dbc0: Suspense now cycles host refs across a suspend like React does: when a boundary
  suspends, host refs in the hidden subtree are detached (object refs set to `null`,
  callback refs invoked with `null`) and re-attached on reveal — even though octane
  preserves the DOM node (React preserves it too, as `hidden`). Previously octane left
  the ref pointing at the detached/hidden node, so a callback ref never saw `null` and an
  object ref's `.current` stayed populated while the content was behind the fallback.

  This covers the compiled template host-ref path (`<span ref={...}/>`) and de-opt host
  slots (value-position / motion-style hosts). Refs attached purely through closures
  (prop spread, the de-opt prop path, fragment refs) are not yet cycled. Per
  `ReactSuspenseEffectsSemantics-test.js:2877`.

- c71d4f3: Make React-style `.tsx` `{expr}` value-hole updates as fast as a `.tsrx`
  `{… as string}` text binding.

  - A renderable `{expr}` child in a template body now compiles to an INLINE
    text-hole fast path: the text node + last value are cached on the binding bag
    (`_chv`/`_chp`), and on update — when the value is an unchanged-skippable
    primitive already backed by a text node — it does a direct `setText`, exactly
    like the `.tsrx` text-binding hot path. Objects/functions (component / element /
    array), the first render, and mode switches go through a `textHole` slow path
    that delegates to the full `childSlot`. Previously every value hole called
    `childSlot` per render — a large function V8 won't inline, with a slot-state
    indirection — which dominated update-heavy keyed lists. (A control-flow-only
    `noTemplate` body, which has no bag, uses a small `textSlot` wrapper instead.)
  - Text-node writes use `node.nodeValue` instead of `node.data` (a `Node`-level
    accessor vs `CharacterData` one prototype hop deeper) across `setText`,
    `childSlot`, the inline text-hole, and the de-opt reconciler — faster on the hot
    text-update path (also speeds the `.tsrx` `setText` path).
  - An ONLY-CHILD `{expr}` value hole (the host's sole content) now lowers FULLY
    MARKERLESS, exactly like a `.tsrx` `{… as string}` text hole: a primitive value
    is a single Text node appended to the host — no `<!>` placeholder, no slot state,
    no end marker — and only an object/function (component / element / array) lazily
    mints markers via `childSlot`. New runtime `childTextHole` + server `ssrChildText`
    (a primitive serializes as the host's bare text; an object keeps its
    `<!--[-->…<!--]-->` block) so hydration adopts either shape. (Sibling-position
    value holes keep a single placeholder via the `ownEnd` reuse above.) This removes
    the per-cell hole-aware `child`/`sibling` navigation + `insertBefore` that the
    marker forced.

  No API or behavioural change. On the dbmon update benchmark (1000-row table) this
  brings `.tsx` to PARITY with `.tsrx` on every op (and byte-identical markerless
  DOM): full-table `tick` ~2.1ms → ~1.4ms, partial `tick` ~0.9ms → ~0.5ms,
  mount ~5.9ms → ~4.4ms, remount ~5.2ms → ~3.9ms.

- a3dce2f: A transition-priority re-suspend of a DESCENDANT under a `@try`/`@pending`
  (Suspense) boundary that already has committed content now HOLDS the previous
  content instead of flashing the `@pending` fallback — matching React's
  `useTransition` "stale screen stays" contract. Previously the hold fired only
  when the boundary's OWN body re-suspended; a child component that re-rendered on
  its own (its own state update inside a transition) and re-suspended on a
  per-value `use(thenable)` / `useSuspenseQuery` would flash the fallback. The
  common case is a router route paginating via a search-param change inside a
  navigation transition: the current page now stays on screen until the next page
  is ready, with `isPending` held true throughout. A non-transition descendant
  re-suspend still soft-detaches and shows the fallback, unchanged.
- c2f3f69: A transition-held Suspense/`@try` boundary now keeps the previously committed
  content across URGENT (async) re-suspensions of that still-committed content,
  instead of flashing the `@pending` fallback — matching React's `useTransition`
  contract that, once prior content is showing, it stays on screen until the new
  tree is ready.

  Previously the hold only fired while the re-suspending render was at transition
  priority. But a held boundary's content can re-suspend at urgent priority — e.g.
  `@octanejs/tanstack-query`'s `useSuspenseQuery` observer notifies on a `setTimeout(0)`
  macrotask, AFTER octane's transition window has closed, so the re-render (and its
  re-suspend on the new in-flight fetch) is urgent. `handleSuspense` then took the
  softDetach + fallback path and the fallback flashed. It now continues the hold
  when the boundary is already transition-held (`hasResolved`, success arm live and
  intact), tracks the new thenable via the existing resume path, and re-arms the
  transition-fallback timeout against it. A fresh urgent suspend with no prior
  committed content still shows the fallback (React parity for urgent suspense).

- 3656e32: Transitions now keep the previous content on screen when they swap in a NEW subtree
  that suspends — matching React's concurrent transition + Suspense contract. Previously
  octane held prior content only for an IN-PLACE re-suspend (the same component re-renders
  and throws before mutating); a transition that REPLACED one component/branch with a
  different one that suspended on mount tore the old content down first, so the boundary
  went blank (no content, fallback suppressed) until the new subtree resolved.

  The fix adds per-swap **off-screen (WIP-model) rendering**: at each swap site
  (`componentSlot`, `childSlot`, `ifBlock`, `switchBlock`), a transition-priority swap to a
  new subtree is rendered off-screen first, with its effects/ref-attaches captured so they
  don't fire until commit. If it completes, it's committed atomically and the old subtree is
  torn down; if it suspends, the partial is discarded and the suspend is re-thrown so the
  enclosing `@try` boundary's existing transition hold keeps the OLD content live and resumes
  - commits once the data resolves. Urgent (non-transition) and hydration renders keep the
    existing clear-then-render path. This also closes the `@octanejs/tanstack-router` gap where a
    concurrent navigation to a slow route briefly blanked instead of holding the current page.

  Note: this is per-swap/per-boundary off-screen rendering, not a full double-buffered tree —
  a single transition that fans out to multiple independent suspending regions reveals them
  piecewise rather than all-at-once (same family as the documented entangled-transition
  partial-commit divergence). Single-boundary transitions (route/tab/query-key changes) match
  React's observable behavior.

- 1987bd7: Perf: a `startTransition` swap at a dynamic `<Comp/>` (`componentSlot`) or an
  `@if`/`@switch`/JSX-ternary branch (`renderBranchSlot`) now renders the incoming
  subtree ONCE instead of twice. Both sites previously rendered the new subtree
  off-screen, discarded it, then rendered it AGAIN in place — a full double render
  of every body, hook, and DOM node. They now COMMIT the off-screen work-in-progress
  the way value-hole `childSlot` already did (adopting and renaming the WIP marker
  pair in place, splicing its captured effects/refs/store-syncs into the live
  queues), halving the swap render work (incoming body executions: 3→2 per swap,
  matching the `childSlot` baseline). Suspend/error hold semantics, effect ordering,
  and final DOM are unchanged; single-root `<Comp/>` return slots keep the legacy
  path.
- f42e5b7: Fix JSX backwards-compat interop: a React-style `.tsx` parent now correctly passes
  children to a `.tsrx` `{props.children}` consumer (previously the children were
  dropped, so e.g. a `.tsx` app entry wrapping `.tsrx` provider components —
  `QueryClientProvider` / `RouterProvider` — rendered the providers but never their
  subtree, blanking the page).

  - `createElement`: for a COMPONENT descriptor, positional children are now mirrored
    into `props.children` (React's `createElement` contract). A component reaches its
    body through `componentSlot`, which forwards `props` only — so `{props.children}`
    could not see positional children. Host descriptors keep using
    `descriptor.children` via the de-opt path (unchanged).
  - `deoptItemBody`: a COMPONENT descriptor appearing as an element of an array child
    (a `.tsx` parent passing MULTIPLE children) now mounts through a nested
    `childSlot` (a real Block with hooks/reconciliation) instead of throwing on the
    host-only de-opt rebuild path.

- cc2bca1: Fix two React-JSX (`.tsx`) compiler backwards-compat gaps. A prop or local referenced
  only inside a spread (`{...expr}`) is now forwarded into the lowered fragment — previously
  the spread applied nothing (prop) or threw a ReferenceError (local), because the
  reference analysis that builds the `createElement(_frag, {…})` arg object only walked
  attribute values and text holes, not spread expressions. And a JSX comment child
  (`{/* … */}`) now compiles to nothing (matching React) instead of an empty interpolation
  hole that produced a build error. The `.tsrx` directive form was already correct.
- 6983478: `useDeferredValue(value, initialValue)`: the initial→value swap is a transition.

  The steady-state deferral already committed via `startTransition` so a suspending
  consumer keeps the prior DOM; the initialValue swap scheduled an URGENT re-render, so
  a consumer that suspends on the real value tore down the initial content and flashed
  the Suspense fallback. Both commits now run at transition priority (React's
  `useDeferredValue` contract).

- 1987bd7: `useSyncExternalStore`: replace the per-commit layout effect with a dedicated
  store-sync queue.

  The value-sync previously ran as a `useLayoutEffect` with
  `[subscribe, value, getSnapshot]` deps, so every snapshot change — and, for the
  dominant inline-`getSnapshot` pattern the zustand/query bindings produce, every
  render — paid effect enqueue, deps compare, and the drainPhase post-order sort per
  subscriber. Store syncs now go through a dedicated sort-free queue drained in
  `commitEffects` right after the layout phase (React's `updateStoreInstance` shape):
  one identity-stable inst cell per hook, a render-phase gate that enqueues only when
  the snapshot or store actually changed, and offscreen/WIP capture integration so
  abandoned transition renders drop their syncs. Subscription lifecycle stays a real
  passive effect. One intentional divergence recorded in the parity plan: a
  getSnapshot-identity-only change with an unchanged value no longer forces a
  commit-time re-read.

## 0.1.1

### Patch Changes

- [#1](https://github.com/octanejs/octane/pull/1) [`dcdf237`](https://github.com/octanejs/octane/commit/dcdf2375ce3a8a2e00b1e1de04f65c2529fd287e) Thanks [@trueadm](https://github.com/trueadm)! - Rename the project from `vyre` to `octane`. The runtime now publishes as `octane` and the Vite metaframework plugin as `@octanejs/vite-plugin`. Identifiers inherited from the Ripple fork were also renamed to Octane (e.g. `setIsRippleActEnvironment` → `setIsOctaneActEnvironment`, the metaframework `ripple()` plugin → `octane()`, and the `ripple.config.ts` convention → `octane.config.ts`). References to the upstream Ripple framework and its `@ripple-ts`/`@tsrx` packages are unchanged.
