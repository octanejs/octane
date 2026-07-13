# Differences from React

Octane implements React's programming model — the same hooks, `memo`, context,
portals, Suspense, transitions, actions, and SSR/streaming APIs — verified by
~2,000 conformance tests ported from `facebook/react` (see
`react-parity-migration-plan.md` for the proof). The differences below are
**deliberate**. Everything not listed here is a bug: file it.

## No rules of hooks (except plain JS loops)

Hooks are tracked by compiler-assigned call-site slot, not call order. A hook
may sit behind a condition or after an early return. The one exception is a
plain JS loop: a slot-keyed hook inside `for`/`while` is a **compile error**,
because every iteration would share the one call-site slot and its
state/memo/effect entries would silently collide. Loop with the keyed `@for`
template directive or extract a child component instead — each item then
renders in its own scope. `use()` and `useContext` are exempt (they are
call-order / context-identity keyed, not slot-keyed), so they may sit in plain
loops.

## Compiler-inferred hook dependencies

Dependency arrays are optional for `useEffect`, `useLayoutEffect`,
`useInsertionEffect`, `useMemo`, `useCallback`, and `useImperativeHandle`.
Omitting the list asks the compiler to derive it from the callback's lexical
captures. The analysis tracks one-level member paths and omits values whose
identity Octane can prove stable, including state setters, reducer dispatchers,
refs, state getters, and `useEffectEvent` results.

An explicit array is authoritative and retains React's exact behavior. Pass
`null` to opt out of tracking and run an effect—or recompute a memo—after every
render. Opaque callback creation such as `useEffect(makeEffect())` requires an
explicit array or `null`, because evaluating it again to construct a dependency
would change program behavior.

## `useState` / `useReducer` current-state getters

Both state hooks have an Octane-only third tuple member: a stable zero-argument
function that reads the hook's latest state (`const [state, update, getState] =
useState(initial)`). This replaces the common React pattern of synchronizing a
ref solely so delayed or async callbacks can avoid a stale render closure.

The getter reads the latest scheduled hook-cell value and does not subscribe or
render. During pending work it can therefore be newer than the currently
committed DOM. The compiler emits a getter-enabled hook only when tuple index 2
can be observed, preserving the existing runtime path and allocation profile for
ordinary two-item destructuring. Escaped or ambiguous tuples conservatively
receive the complete three-item shape.

## Native event objects, no synthetic event layer

Event propagation itself matches React and is **not a divergence**. Ordinary
bubbling and capture, `stopPropagation`, logical propagation through portals,
and native non-bubbling families (`toggle`, dialog `close`/`cancel`, media,
`load`/`error`) all reach the same logical ancestors React does.

What differs is the event API and synthesis layer:

- Handlers receive the browser's real `Event` object, not a React
  `SyntheticEvent` wrapper. There is no event pooling, and
  `event.currentTarget` is the handler's element.
- `mouseenter`/`pointerenter` families are the real per-element native events —
  no synthesis from `over`/`out`.
- There are no synthetic `onChange`/`onBeforeInput`/`onSelect` polyfills — use
  the native events (`onInput` etc.).

A noop `onclick` is stamped on delegation roots for iOS Safari, not on every
element.

## Controlled components, native events

Controlled `value`/`checked` on `<input>`/`<textarea>`/`<select>` match React
(2026-07-08): the prop drives the DOM property and reasserts on every commit
and after discrete events (rejected edits snap back), IME composition is
respected, radio groups restore as a group, `<select value>` projects options
(single + multiple), and `defaultValue`/`defaultChecked` are the uncontrolled
escape hatch. Hydration adopts pre-hydration user input, then the first
commit/discrete event reasserts. `<textarea>` with children AND a
`value`/`defaultValue` prop is a compile error (the prop owns the content).

What differs is the **event layer**: there is no synthetic `onChange`.
`onInput` is the per-keystroke handler for text controls (the native `change`
event fires on blur/commit); checkboxes/radios/selects work through native
`change`/`click`, whose timing matches React anyway. A dev warning flags a
controlled text control with no `onInput` (special-cased when only `onChange`
is present). Migration is a rename:

```jsx
<input value={text} onChange={(e) => setText(e.target.value)} /> // React
<input value={text} onInput={(e) => setText(e.target.value)} /> // Octane
```

Form **actions**
(`<form action={fn}>`, `useActionState`, `useFormStatus`, `useOptimistic`,
`requestFormReset`, auto-reset) match React 19; an action error does **not**
cancel queued dispatches (octane keeps threading).

## Attributes: native names, React's value rules

Attribute **values** follow React (matched 2026-07-08): boolean attributes
(`disabled`, `hidden`, `inert`, `readOnly`, …) normalize — any truthy value
renders the canonical `attr=""`, falsy removes (`hidden={0}` → absent); a
boolean on a non-boolean attribute is removed + dev-warns (`title={true}` does
not render `title=""`); `download`/`capture` keep React's overloaded-boolean
semantics; `muted`/`multiple`/`selected` dynamic writes set the DOM
**property** (mustUseProperty); `autoFocus` writes no attribute — the element
is focused in the commit phase of its mount. Also matched: `aria-*` and
`spellcheck`/`contenteditable`/`draggable` stringify booleans; empty
`src`/`href` are stripped (except `<a>`/`<area>`); function/symbol values are
removed; `dangerouslySetInnerHTML` shape and children-exclusivity throw; the
canonical camelCase aliases (`strokeWidth` → `stroke-width`, `xlinkHref`,
`className`/`htmlFor`) write the native attribute.

What still differs: attribute **names** pass through natively — native
spellings (`accept-charset`, `arabic-form`) are the idiom and simply work, and
there is no exhaustive `possibleStandardNames` DEV table. Only a curated slice
of genuinely-broken casings warns in dev (`autofocus` → `autoFocus`,
`defaultvalue` → `defaultValue`, `defaultchecked` → `defaultChecked`,
lowercase `on*` function props → camelCase). Odd objects coerce leniently via
`toString()` (with a dev `[object Object]` warning) instead of throwing.

## `class`/`className` compose clsx-style

Strings, numbers, arrays, objects, and nesting compose into a class string at
every apply site, client and SSR (byte-identical). React coerces
`className={['a','b']}` to `"a,b"`; octane yields `"a b"`. Nullish/false
removes the attribute; an empty string writes `class=""`.

## Reconciler: LIS moves, identical results

The keyed reconciler minimizes DOM moves (LIS) instead of React's
`lastPlacedIndex`. Survivor node identity and final order are guaranteed and
stress-tested (including under mid-reconcile throws); only the set of
physically-moved nodes can differ.

## Scheduler: synchronous, two priorities

Renders are microtask-batched and run to completion — no lanes, yields,
time-slicing, expiration, or selective hydration. Consequences:

- `flushSync` drains the whole queue (transition work included) and never runs
  passive effects synchronously — passives are always post-paint.
- Priority (`urgent` vs `transition`) governs **suspense hold semantics** —
  transition renders keep prior content on suspend, entangled boundaries reveal
  atomically — not commit deferral.
- Multiple unhandled root errors in one flush throw an `AggregateError`; an
  unhandled error unmounts its root's whole tree (both match React).
- `useSyncExternalStore` skips React's commit-time getSnapshot re-read for
  unchanged values (the concurrent-interleaving window it guards doesn't exist
  here).

## Parallel `use()`: no suspense waterfalls (default; opt out with `parallelUse: false`)

The compiler's parallel-`use()` pipeline is ON by default
(docs/suspense-parallel-use-plan.md; pass `parallelUse: false` to compile/the
vite plugin for React-timing waterfall semantics). Idiomatic sequential
`use()` code stops waterfalling — React runs the same code serially:

- **Creations are memoized per call site**: `use(fetchA(id))` compiles to a
  slot-keyed memo with member-path deps (`[fetchA, id]`), so replays never mint
  fresh promises and refetch happens exactly when inputs change.
- **Independent creations start together**: provably-independent `use()`
  arguments in one body are hoisted above the first unwrap and the boundary
  suspends ONCE on the whole stratum (one replay per settled batch, not one per
  promise). True data dependencies (`use(f(a))`) stay sequential.
- **Fetch trees warm across components**: a suspended body prefetches
  descendants whose reachability and props are provably independent of the
  suspended data (compiled `__warm` plans, depth-capped recursion), so a nested
  async chain loads in max(latency), not levels × latency —
  `benchmarks/async-waterfall`: 20.1ms vs React's 307.3ms on a 10-level chain.
- Unwrap order, hydration-seed order, rejection routing (`@catch` receives the
  first-in-order reason), and `@pending`/transition semantics are unchanged.
- Runtime safety nets (React parity, always on, flag or no flag): a replay that
  creates a fresh promise for a slot that already holds one reuses the stored
  thenable ("uncached promise" dev warning), and a replay that discovers a new
  pending `use()` behind a data dependency gets a dev waterfall diagnostic.

## Errors: `@try` / `@catch`, not class boundaries

`@catch (err, reset)` (and the JSX `<ErrorBoundary>`) replaces class
error-boundary lifecycles. Catch fallbacks mount fresh nodes (like React's
`forceUnmountCurrentAndReconcile`); deletion-phase and ref-detach errors route
to the enclosing boundary; uncaught-error surfacing is `console.error` rather
than `onUncaughtError`.

## SSR and streaming

`renderToString`/`renderToStaticMarkup`/`prerender` return `{ html, css }` —
the `css` field carries octane's scoped styles (React has no equivalent).
`renderToPipeableStream`/`renderToReadableStream` stream out-of-order Suspense
like Fizz, with these scope differences: per-round re-passes (the prerender
cost model) instead of per-boundary incremental renders; no selective
hydration; head elements hoisted inside streamed boundaries re-create
client-side on hydration. Hydration mismatch recovery patches attributes to the
**client** value (React keeps the server's) and warns + rebuilds in place
rather than throwing.

## Not implemented (by design)

Class components, Server Components/RSC, `StrictMode` double-invoke,
`Profiler`, `SuspenseList`, `forwardRef`/`createRef` (refs are props),
`useDebugValue` is a no-op, `cache()`, `React.Children` beyond the basics.
Resource hints ARE supported
(`preload`/`preinit`/`preconnect`/`prefetchDNS`). React-19 custom-element
listener semantics ARE supported (a function-valued lowercase `on*` prop on a
custom element attaches a real listener — adjudicated 2026-07-05); the
property-vs-attribute heuristic is not (attributes only, per the pass-through
policy).
