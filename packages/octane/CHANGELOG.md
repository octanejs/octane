# octane

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
