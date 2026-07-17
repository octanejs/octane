# Skill: Octane's intentional divergences from React

Use this when behavior differs from React and you need to decide whether it is a
bug or by design. Do not "fix" these toward React.

## No rules of hooks — except plain JS loops

Hooks are tracked by compiler-assigned call-site slot, not call order. A hook may
sit behind a condition or after an early return; code that relies on hook-order
errors firing does not apply. The one restriction: a slot-keyed hook inside a
plain JS loop is a **compile error** (every iteration would share the one
call-site slot). Loop with the keyed `@for` template directive or extract a
child component instead. `use()` and `useContext` are exempt (call-order /
context-identity keyed, not slot-keyed).

## Dependency arrays are compiler-inferred when omitted

Omitting the array on `useEffect`, `useLayoutEffect`, `useInsertionEffect`,
`useMemo`, `useCallback`, or `useImperativeHandle` does not mean "every render"
— the compiler derives dependencies from lexical captures, omitting stable hook
results (state setters/dispatchers, refs, state getters, `useEffectEvent`
results). Locally declared custom hooks in full-compiled `.tsrx`/`.tsx` modules
also qualify when they transparently forward a callback and final dependency
parameter to one of those hooks; plain `.ts`/`.js`, imported/method, or
transforming wrappers require an explicit list. Explicit arrays keep React's
exact behavior and are never rewritten; `null` explicitly means run or
recompute after every render.

## State hooks expose a current-state getter

`useState` and `useReducer` have a stable third tuple member
(`[state, update, getState]`) that reads the latest scheduled hook-cell value.
Ordinary two-item destructures keep the allocation-free React shape.

## Controlled inputs match React — on native events

Controlled `value`/`checked` follow React's semantics exactly: the prop drives
the DOM property and reasserts on every commit and after discrete events;
`defaultValue`/`defaultChecked` are the uncontrolled escape hatch. But there is
no synthetic event layer: `onInput` is the per-keystroke handler for text
controls, and native `change` fires on blur/commit. Do not add a synthetic
`onChange` normalization.

## Native delegated events

`onClick`, `onInput`, `onSubmit` etc. are real DOM events via delegation, not a
synthetic layer. Timing, bubbling, and `event.target` semantics match the
platform, not React's wrapper.

## Parallel `use()` — no suspense waterfalls

The compiler unconditionally memoizes `use()`
argument creations per call site, starts provably-independent fetches together,
suspends once per stratum, and prefetches independent descendant fetch trees.
React runs the same code as a serial waterfall — do not "fix" fetch-start
timing, batch replay counts, or prefetch behavior toward React. True data
dependencies stay sequential; unwrap order, hydration-seed order, and rejection
routing match React.

## Keyed reconciler moves differ

Reconciliation is LIS-based (minimal DOM moves), not React's `lastPlacedIndex`.
The final DOM and survivor node identity are guaranteed identical to React; the
set of physically moved nodes is not. Tests asserting which nodes moved will
diverge; tests asserting final order and identity will pass.

## Synchronous first root mount and root API extensions

The first `root.render()` mounts synchronously, so render-then-unmount in one
outer batch can expose intermediate DOM that React's concurrent root elides.
`root.render(App, props)` is supported alongside `root.render(<App />)`. A root
whose managed DOM was externally removed unmounts safely instead of throwing
the browser's incidental `NotFoundError`.

## `lazy()` accepts bare components

React's `{ default }` module shape works, and Octane additionally accepts a
component directly from the loader. Suspense and ViewTransition are ordinary
components, so wrapping them in `lazy()` is valid; nested lazy wrappers are not.

## class / className composes clsx-style

Strings, numbers, arrays, objects, and nesting compose into a class string;
falsy parts drop out. React coerces an array to `"a,b"`; Octane yields `"a b"`.

## Not present at all

- Class components (rewrite as function components).
- Server Components / `'use client'` / `'use server'`.
- StrictMode double-invoke (renders and effects run once).
- `forwardRef` (refs are props, React 19 style).
- SuspenseList, Profiler, findDOMNode.

## Everything else matches

Observable hook, effect, Suspense, and transition semantics match React,
including effect ordering (child-first on mount, parent-first cleanup on
deletion), `Object.is` state bailouts, batching, and `useId` stability across
server render and hydration. `useDebugValue` exists as an accepted no-op.
