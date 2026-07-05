# Differences from React

Octane implements React's programming model — the same hooks, `memo`, context,
portals, Suspense, transitions, actions, and SSR/streaming APIs — verified by
~2,000 conformance tests ported from `facebook/react` (see
`react-parity-migration-plan.md` for the proof). The differences below are
**deliberate**. Everything not listed here is a bug: file it.

## No rules of hooks

Hooks are tracked by compiler-assigned call-site slot, not call order. A hook
may sit behind a condition, after an early return, or in a loop.

## Native events, no synthetic event system

Events are real, delegated DOM events (`onClick`, `onInput`, `onSubmit`) —
behavior matches the platform, never React's emulation layer:

- Non-bubbling events (`toggle`, `close`, `cancel`, media, `load`/`error`) fire
  the **target's** handler only; React re-dispatches them to ancestors.
- `mouseenter`/`pointerenter` families are the real per-element native events —
  no synthesis from `over`/`out`.
- No synthetic `onChange`/`onBeforeInput`/`onSelect` polyfills — use the native
  events (`onInput` etc.). No event pooling; `event.currentTarget` is the
  handler's element, `stopPropagation` and capture phase work natively.
- Delegated events bubble through **portals along the logical tree** (like
  React). A noop `onclick` is stamped on delegation roots (iOS Safari), not on
  every element.

## No controlled form components

`value`/`checked` are plain attributes; inputs are uncontrolled and native; the
DOM is the source of truth. There is no controlled-value re-assertion and no
property routing (`muted` etc. stay attributes). Form **actions**
(`<form action={fn}>`, `useActionState`, `useFormStatus`, `useOptimistic`,
`requestFormReset`, auto-reset) match React 19; an action error does **not**
cancel queued dispatches (octane keeps threading).

## Attributes: native pass-through, no tables

No `possibleStandardNames` alias table (write native spellings —
`accept-charset`, `arabic-form`; only React's own `className`/`htmlFor` are
aliased), no known-attribute table (`unknown={true}` → boolean presence `""`;
`inert=""` stays present, which the platform reads as **true**; truthy strings
on boolean attributes pass verbatim), lenient `toString()` coercion instead of
throwing on odd objects. Shared React policies that DO apply: `aria-*` and
`spellcheck`/`contenteditable`/`draggable` stringify booleans; empty
`src`/`href` are stripped (except `<a>`/`<area>`); function/symbol values are
removed; `dangerouslySetInnerHTML` shape and children-exclusivity throw.

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
