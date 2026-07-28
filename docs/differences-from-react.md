# Differences from React

Octane implements React's programming model — the same hooks, `memo`, context,
portals, Suspense, transitions, actions, and SSR/streaming APIs. Its core suite
contains 3,900+ distinct behavioral tests; production-compiler executions rerun
the normal cases and are not additional unique coverage. That is a local suite
count, not a count of tests ported from React. The exact pinned snapshot,
source-attributed React scenarios, classifications, and coverage are tracked in
the generated [React parity coverage report](./react-parity-coverage.md).

The differences below are **deliberate**; parity outside them is the goal.
Examples omit routine imports and types unless they affect the behavior being
shown.

## No rules of hooks (except plain JS loops)

Hooks may sit behind a condition or after an early return:

```tsx
// React: hook order cannot change after a conditional return.
// Octane: every hook call site owns its own stable slot.
function Editor({ editable, initialValue }) {
  if (!editable) return <ReadOnly />;

  const [draft, setDraft] = useState(initialValue);
  return (
    <input
      value={draft}
      onInput={(event) => setDraft(event.currentTarget.value)}
    />
  );
}
```

This is valid in Octane because the compiler assigns each hook call site a
stable slot; hooks are not identified by call order.

A plain JavaScript loop is the exception:

```tsx
for (const item of items) {
  useState(false); // Compile error: every iteration would share one slot.
}

@for (const item of items; key item.id) {
  const [open, setOpen] = useState(false); // Separate state for each key.
  <Row item={item} open={open} onToggle={() => setOpen(!open)} />
}
```

Use a keyed `@for` template directive or extract a child component so every item
has its own render scope. `use()` and `useContext` are exempt from the loop
restriction because they are keyed by call order and context identity,
respectively.

## Compiler-inferred hook dependencies

Dependency arrays are optional for `useEffect`, `useLayoutEffect`,
`useInsertionEffect`, `useMemo`, `useCallback`, and `useImperativeHandle`:

```tsx
import { save } from './api';

useEffect(() => save(order.id)); // Inferred: [order.id]
useEffect(() => save(order.id), [order]); // Exactly [order]
useEffect(() => save(order.id), []); // Exactly []; never rewritten
useEffect(() => save(order.id), null); // Run after every render

useEffect(makeEffect()); // Compile error: pass an array or null
```

Omitting the argument asks the compiler to derive it from the callback's lexical
captures. An explicit array is authoritative and keeps React's exact behavior;
`null` opts out of tracking. Opaque callback creation such as
`useEffect(makeEffect())` needs an explicit array or `null`, because evaluating
it again to discover dependencies would change program behavior.

### Direct built-in hook calls

Inference applies wherever Octane processes a supported built-in hook call,
including inside a custom hook authored in `.tsrx`, `.tsx`, or plain
`.ts`/`.js`. For example, a custom hook in plain TypeScript can omit both
dependency arrays:

```ts
import { useEffect, useMemo } from 'octane';

export function useLoggedValue(value: string, log: (value: string) => void) {
  const formatted = useMemo(() => value.toUpperCase());

  useEffect(() => {
    log(formatted);
  });

  return formatted;
}
```

The memo tracks `value`; the effect tracks `formatted` and `log`. The custom
hook's caller supplies no dependency array.

The analysis tracks one-level member paths and distinguishes values that can
change between renders:

| Capture | Inferred behavior |
| --- | --- |
| Other component-local values and module-scope `let`/`var` | Tracked |
| State setters, reducer dispatchers, refs, and state getters | Omitted as stable |
| `useEffectEvent` results | Omitted because Effect Events are non-reactive |
| Imports and unreassigned module-scope `const`/`function`/`class` | Omitted as program-lifetime identities |
| A local `const` naming one of those stable values, or a literal | Omitted |

A member read through a stable module binding, such as `CONFIG.mode`, is also
omitted. Mutating such an object in place is therefore not witnessed by a
dependency array; state that should drive rendering belongs in state, context,
or a store rather than a module singleton.

### Calls to custom wrappers

Inferring a missing dependency argument at a **call to a custom wrapper** is a
separate, narrower operation:

```tsx
function useTrackedEffect(effect, dependencies) {
  useEffect(effect, dependencies);
}

useTrackedEffect(() => save(order.id)); // Local transparent wrapper: inferred.
importedTrackedEffect(() => save(order.id), [order.id]); // Explicit array.
```

| Wrapper call | Dependency argument |
| --- | --- |
| Local transparent wrapper in `.tsrx`/`.tsx` | Inferred |
| Nested transparent wrappers in the same module | Inferred |
| Wrapper call in plain `.ts`/`.js` | Required explicitly |
| Imported or method-style wrapper | Required explicitly |
| Wrapper that inspects or transforms its callback/dependencies | Required explicitly |

A transparent wrapper forwards its callback and final dependency parameter to a
supported built-in hook. The compiler does not infer that contract from a
`use*` name alone. Plain `.ts`/`.js` compilation still infers direct built-in
hook calls inside a custom hook; it only declines to modify calls to wrappers.

## Automatic memoization and calls in templates

Production builds automatically memoize component regions under the same
pure-render, immutable-snapshot contract assumed by React Compiler:

```tsx
{formatPrice(cents)} // May memoize: formatPrice is imported.
{formatLabel(row)} // May memoize: same-module immutable projection.

{row.getValue()} // Re-runs: member call.
{format(row.get())} // Re-runs: an argument contains a member call.
{localFormat(row)} // Re-runs: component-local callee.
{use(resource)} // Re-runs: hook and suspension point.
```

A call keeps its surrounding region memoizable only when the callee is an
imported binding or an unreassigned same-module function whose body is itself a
value projection. Arguments must satisfy the same rule.

Member calls fail closed because the receiver may be a live object:
`header.getIsSorted()` can return a new answer while `header` retains the same
identity. A module helper that merely wraps that method has the same hazard and
does not qualify. Component-local callees, hooks (including `unstable_use*`),
`new Foo()`, and tagged templates also keep their region unmemoized. This
changes only the optimization—the region safely re-runs.

A region *is* allowed to memoize past a mutable module-level variable, whether
read directly or returned by an imported helper; module state that must drive
rendering belongs in state or context. Octane cannot read across a module
boundary, so an imported helper is taken at its word — that is the one place
this analysis trusts rather than proves, and it matches React Compiler's own
assumption.

## Derived values are cached at their declaration

```tsx
const labels = formatRows(rows); // Cached on [rows]: imported projection.
const items = virtualizer.getVirtualItems(); // Not cached: member call.
const visible = todos.filter((todo) => !todo.completed); // Not cached.
let freshLabels = formatRows(rows); // Not cached: `let` is an escape hatch.
```

An eligible `const` keeps the same identity until its tracked component-local
inputs change. This lets a region key on the identity of a derived value instead
of seeing a new array or object on every render.

The same callee rule governs declaration caching. The virtualizer call must stay
live because its window can move while the virtualizer object keeps the same
identity. The `filter` call is a genuine optimization miss—the compiler cannot
yet distinguish it from the live-object case—so both fail closed. Use an
explicit `useMemo` when the identity matters.

Also never cached:

- **Hook calls.** `const s = useThing()` and `const s = unstable_useThing()`
  keep their hook cells and subscriptions. Hooks are recognised by naming
  convention — the same signal React and React Compiler use — so a hook named
  outside that convention is the one shape this cannot protect.
- **Values the render tree never reads.** A calculation used only by an event
  handler pays nothing.

Within those bounds the contract is pure render: the cached value is reused while
its tracked inputs are unchanged, so a projection that reads state no input
witnesses keeps its old value. Pass such state through
`useState`/`useReducer`/context and it is witnessed normally.

## `useState` / `useReducer` current-state getters

Both state hooks have an Octane-only third tuple member: a stable `getState`
function that reads the latest scheduled state.

```tsx
const [draft, setDraft, getDraft] = useState('');
const [total, dispatch, getTotal] = useReducer(reducer, 0);

async function saveLater() {
  await readyToSave();
  save(getDraft()); // Latest scheduled state, not this render's stale value.
}

function add(amount) {
  dispatch(amount);
  console.log(getTotal()); // Latest scheduled reducer state.
}
```

`getState` is the conventional generic name for this stable zero-argument
getter; the example uses domain-specific names instead. It replaces the common
React pattern of synchronizing a ref solely for delayed or async callbacks.

The getter reads the latest scheduled hook-cell value and does not subscribe or
render. During pending work it can therefore be newer than the currently
committed DOM. The compiler emits a getter-enabled hook only when tuple index 2
can be observed, preserving the existing runtime path and allocation profile for
ordinary two-item destructuring. Escaped or ambiguous tuples conservatively
receive the complete three-item shape.

## JSX values follow the represented render scope

Moving compiler-authored JSX into a variable, prop, array, or other value
position does not move its represented context provider, Suspense boundary, or
error boundary:

```tsx
const Theme = createContext('outer');
const theme = {
  get current() {
    return use(Theme);
  },
};

function Page() {
  const content = (
    <Theme.Provider value="inner">
      <span data-theme={theme.current}>{theme.current}</span>
    </Theme.Provider>
  );

  return <main>{content}</main>; // data-theme="inner" and text "inner".
}
```

When Octane renders that stored subtree, the entire compiler-authored element
record, including a dynamic root type, its props, and descendant expressions,
resolves after its represented provider or boundary has entered its scope. This
includes implicit user code in getters, Proxy traps, coercion hooks, iterators,
and computed keys, not only explicit function calls. React evaluates JSX
expressions while constructing the caller's element, before that element's
represented provider or boundary renders; Octane intentionally follows the
visible rendered tree instead.

JSX values remain inspectable element descriptors: `isValidElement`,
`Children.only`, `cloneElement`, and ordinary `type`/`props`/`children`
inspection keep their existing contracts. Inspecting a deferred element record
as data resolves it in the inspecting caller's current scope; it does not enter
a provider or boundary that has not rendered. Static JSX, explicit
`createElement(...)` calls, and event or render-prop callbacks retain ordinary
JavaScript evaluation semantics.

## Native event objects, no synthetic event layer

Event propagation itself matches React and is **not a divergence**. Ordinary
bubbling and capture, `stopPropagation`, logical propagation through portals,
and native non-bubbling families (`toggle`, dialog `close`/`cancel`, media,
`load`/`error`) all reach the same logical ancestors React does.

What differs is the event API and synthesis layer:

```tsx
<button
  onClick={(event) => {
    console.log(event instanceof MouseEvent); // true
  }}
/>
```

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
event fires when the browser commits the edit, usually on blur);
checkboxes/radios/selects retain their normal native `change` behavior. Migration
of React-style text editing is a rename:

```jsx
<input value={text} onChange={(e) => setText(e.target.value)} /> // React
<input value={text} onInput={(e) => setText(e.target.value)} /> // Octane
```

`OCTANE_NATIVE_TEXT_ONCHANGE` warns when a statically known text-entry host has
`onChange`/`onChangeCapture` but no usable input handler. It covers `<textarea>`
and `<input>` with a missing or invalid type, or a `text`, `search`, `url`, `tel`,
`password`, `email`, or `number` type. A development fallback handles unresolved
spreads, dynamic host/type values, and de-optimized `createElement` calls. It is
nonfatal and never changes which event runs. Selects, checkboxes, radios, file
inputs, custom elements, and component callbacks named `onChange` are not
warned. Capture handlers receive the corresponding `onInputCapture` guidance.

Native commit behavior is sometimes exactly the intent. Use an uncontrolled
value and the explicit JS-only suppression in that case:

```jsx
<input
  defaultValue={savedDraft}
  onChange={(event) => save(event.currentTarget.value)}
  suppressNativeChangeWarning
/>
```

`suppressNativeChangeWarning` only suppresses this diagnostic. It does not
serialize to HTML, rename an event, add a listener, or alter controlled-state
restoration. Do not add a noop `onInput` merely to silence the warning.

Checkbox/radio activation follows the platform's `click` → `input` →
non-cancelable `change` sequence. `preventDefault()` in native `onChange`
therefore cannot roll the toggle back:

```jsx
<input type="checkbox" onClick={(event) => event.preventDefault()} />
```

Cancel in `onClick` when rollback is intended. React's synthetic checkable
`onChange` is click-backed and can cancel activation at that callback, an
intentional event-layer divergence. Octane still lets native input/change
handlers observe the prospective checked state before restoring rejected
controlled state and radio cousins.

Form **actions**
(`<form action={fn}>`, `useActionState`, `useFormStatus`, `useOptimistic`,
`requestFormReset`, auto-reset) match React 19; an action error does **not**
cancel queued dispatches (octane keeps threading).

## Attributes: native names, React's value rules

Attribute **values** follow React (matched 2026-07-08):

```tsx
<div hidden={1} /> // hidden=""
<div hidden={0} /> // attribute omitted
<div title={true} /> // omitted with a development warning
<div spellcheck={false} /> // spellcheck="false"
```

This includes boolean and overloaded-boolean normalization, property writes for
`muted`/`multiple`/`selected`, commit-phase `autoFocus`, `aria-*` stringification,
empty `src`/`href` removal (except `<a>`), function/symbol removal,
`dangerouslySetInnerHTML` validation, and canonical camelCase aliases such as
`strokeWidth`, `xlinkHref`, `className`, and `htmlFor`.

What still differs: attribute **names** pass through natively — native
spellings are the idiom and simply work:

```tsx
<form accept-charset="utf-8" />
```

Diagnostic coverage is expanding progressively from the latest upstream
behavior without shipping React's complete `possibleStandardNames` table as
runtime data. Today, a curated slice of genuinely-broken casings warns in
development (`autofocus` → `autoFocus`, `defaultvalue` → `defaultValue`,
`defaultchecked` → `defaultChecked`, lowercase `on*` function props →
camelCase).

Other current differences:

- Odd objects coerce leniently via `toString()` (with a development
  `[object Object]` warning) instead of throwing.
- Octane retains `<area href="">` as a current-document hyperlink; React strips
  it.
- The browser parser canonicalizes a statically authored lowercase SVG
  `textlength` instead of following React's imperative warning path.

## Development diagnostics and production errors

Octane progressively ports applicable development warnings and errors from the
latest upstream React/ReactDOM source. For a diagnostic classified as exact
parity, its tests cover observable details such as the trigger, console channel or
thrown constructor, message variants, dedupe lifetime, recovery, and
component/source context. Current coverage is intentionally partial: the
[latest-main diagnostic inventory](./react-diagnostics-plan.md#latest-main-diagnostic-inventory)
records implemented, pending, adapted, divergent, and unsupported families.
Diagnostics are adapted when an intentional Octane difference changes the useful
guidance; React-only APIs remain outside the supported surface.

Development builds retain complete messages. Framework-authored errors in the
core DOM client and server runtimes that must still throw in production use an
[Octane-owned error-code catalog](../packages/octane/error-codes/README.md) and
compact links to `https://octanejs.dev/errors/<code>`. Octane's numbers are
unrelated to React's and are append-only so an already-deployed bundle continues
to decode correctly. Compiler diagnostics keep their symbolic `OCTANE_*` codes,
and user-thrown or transported error messages are never rewritten as framework
errors.

## `class`/`className` compose clsx-style

```tsx
<div class={['button', { active: selected }, ['compact']]} />
// selected=true → class="button active compact"

<div className={['a', 'b']} />
// React: class="a,b"
// Octane: class="a b"
```

Strings, numbers, arrays, objects, and nesting compose at every client and SSR
apply site with byte-identical results. A nullish or `false` result removes the
attribute; an empty string writes `class=""`.

## Reconciler: LIS moves, identical results

The keyed reconciler minimizes DOM moves (LIS) instead of React's
`lastPlacedIndex`. Survivor node identity and final order are guaranteed and
stress-tested (including under mid-reconcile throws); only the set of
physically-moved nodes can differ.

## Scheduler: synchronous, two priorities

Renders are microtask-batched and run to completion — no lanes, yields,
time-slicing, expiration, or selective hydration. Priority changes Suspense
behavior, not whether ordinary work is time-sliced:

```tsx
setPage(next); // If it suspends, show the pending fallback.
startTransition(() => setPage(next)); // Keep the previous content while pending.
```

`flushSync` drains both priorities but leaves passive effects asynchronous:

```tsx
flushSync(() => {
  setQuery('octane');
  startTransition(() => setResults(nextResults));
});
// Both updates committed; passive effects still run later.
```

Other consequences:

- Priority (`urgent` vs `transition`) governs Suspense hold semantics, not
  general commit deferral.
- Fallback-visible boundaries whose retries fully stage reveal together,
  including refs and layout effects.
- Same-identity synchronous rendering remains per-swap rather than using a
  global React-style work-in-progress tree. See
  [Suspense divergence #4](../packages/octane/audit/SUSPENSE_DIVERGENCE.md).
- Multiple unhandled root errors in one flush throw an `AggregateError`; an
  unhandled error unmounts its root's whole tree (both match React).
- `useSyncExternalStore` skips React's commit-time getSnapshot re-read for
  unchanged values (the concurrent-interleaving window it guards doesn't exist
  here).

## Parallel `use()`: no suspense waterfalls

The compiler always applies its
[parallel-`use()` transform](./suspense-parallel-use-plan.md). When it can prove
requests independent, idiomatic sequential `use()` code avoids the waterfall
React incurs for the same source:

```tsx
// These fetch functions are imported module bindings.
const profile = use(fetchProfile(id)); // Starts now.
const posts = use(fetchPosts(id)); // Starts with profile.
const avatar = use(fetchAvatar(profile.avatarId)); // Waits for profile.
```

The first two creations form one independent stratum: they start together and
the boundary suspends once for the batch. The third has a true data dependency
and remains sequential.

- **Creations are memoized per call site**: `use(fetchA(id))` compiles to a
  slot-keyed memo with member-path deps (`[fetchA, id]`), so replays never mint
  fresh promises and refetch happens exactly when inputs change.
- **Fetch trees warm across components**: a suspended body prefetches
  descendants whose reachability and props are provably independent of the
  suspended data (compiled `__warm` plans, depth-capped recursion), so a nested
  async chain loads in max(latency), not levels × latency —
  `benchmarks/async-waterfall`: 20.1ms vs React's 307.3ms on a 10-level chain.
- Unwrap order, hydration-seed order, rejection routing (`@catch` receives the
  first-in-order reason), and `@pending`/transition semantics are unchanged.
- Runtime safety nets (React parity): a replay that
  creates a fresh promise for a slot that already holds one reuses the stored
  thenable ("uncached promise" dev warning), and a replay that discovers a new
  pending `use()` behind a data dependency gets a dev waterfall diagnostic.

Known gaps are regression-pinned in `benchmarks/async-composition`:

| Shape | Current behavior |
| --- | --- |
| Independent `use()` calls inside an imported custom hook | Serialize because independence analysis stops at the module boundary |
| Adjacent async children under a parent with no `use()` | Are discovered serially because the parent never triggers its warm plan |
| A transition-wrapped update | Reveals resolved content progressively instead of holding the whole previous screen |

The transition result is monotonic: it never rolls back, and a dependent value
never renders against stale input. The benchmark sets one-way ceilings so all
three gaps can only improve.

## Root component entry points and container ownership

Both entry forms are valid:

```tsx
// Choose either entry form:
root.render(<App />); // React-compatible
// or
root.render(App, props); // Octane extension
```

The second form avoids creating an element descriptor at application bootstrap.
A bare function passed to `root.render` is therefore intentional, not an
invalid-child warning.

The first `root.render()` mounts synchronously. React's concurrent root queues
its initial mount, so a render followed by an unmount in the same surrounding
batch exposes no intermediate DOM there; Octane may expose the mounted DOM
before its synchronous unmount leaves the same empty final state.

```tsx
root.render(App, props);
console.log(container.firstChild !== null); // true
```

After `root.unmount()`, the root is permanently closed. If outside code removes
some of a root's managed DOM first, unmount still performs safe cleanup instead
of surfacing the browser's incidental `NotFoundError` from removing an already
detached node.

## `lazy()` module resolution

Like React, `lazy(load)` accepts a thenable that resolves to a module object with
a `default` component. Octane additionally accepts a bare component as the
resolved value, making named dynamic imports usable without a default-export
shim:

```tsx
const Chart = lazy(() =>
  import('./Chart').then((module) => module.Chart),
);
```

Nested lazy wrappers are rejected.

React's Suspense and ViewTransition values are exotic element types and React
rejects wrapping them in `lazy()`. Octane exposes those boundaries as ordinary
component functions, so a lazy wrapper preserves their normal component
behavior.

## Errors: `@try` / `@catch`, not class boundaries

```tsx
@try {
  <RiskyPanel />
} @catch (error, reset) {
  <button onClick={() => reset()}>Retry</button>
}
```

`@catch (error, reset)` and the JSX `<ErrorBoundary>` replace class
error-boundary lifecycles. Catch fallbacks mount fresh nodes (like React's
`forceUnmountCurrentAndReconcile`); deletion-phase and ref-detach errors route
to the enclosing boundary. Uncaught errors surface through `console.error`
rather than `onUncaughtError`.

## Refs are props

Components receive refs as ordinary props; there is no `forwardRef` wrapper:

```tsx
function Search({ ref }) @{
  <input ref={ref} />
}

<Search ref={[inputRef, measure]} />
```

A ref may be a callback, a `{ current }` object, or an array of refs as shown
above.

## SSR and streaming

### Rendering surface

The buffered renderers return Octane's scoped CSS beside the HTML:

```tsx
const { html, css } = renderToString(App, props);
```

`renderToString`, `renderToStaticMarkup`, and `prerender` all return
`{ html, css }`; React has no equivalent `css` field. Hoisted document metadata
folds into `html` as React does. For a host that owns the surrounding
`<head>`-bearing template, `headChannel: 'separate'` instead exposes
`RenderResult.head` and `StreamOptions.onHeadReady`.

### Streaming

`renderToPipeableStream` and `renderToReadableStream` stream out-of-order
Suspense like Fizz, with these differences:

- Octane performs per-round re-passes (the prerender cost model), not
  per-boundary incremental renders.
- There is no selective hydration.
- Head elements hoisted inside streamed boundaries are re-created on the client
  during hydration.

Octane leaves document and transport orchestration to the surrounding server.
It has no Fizz bootstrap-script/module/import-map, doctype/preamble, `onHeaders`,
or header-construction options. One `nonce` covers every inline style and script
Octane emits rather than exposing separate script and style channels.

A readable stream's `allReady` settles after all boundary bytes have been
accepted under consumer backpressure, so consumers should read the stream while
awaiting it. Error callbacks report the original value without synthesizing
React digests or React's `errorInfo` shape.

### Hydration

Attribute mismatches recover to the **client** value; React keeps the server
value. Octane warns and rebuilds a mismatched subtree in place rather than
throwing.

Production structural validation has the same depth as React: it checks an
adopted root's node type and tag. Tag and text mismatches still recover, but
different static branches that share a tag may not be detected:

```html
<!-- Server branch -->
<span class="compact">...</span>

<!-- Client branch -->
<span class="expanded">...</span>
```

Development performs the full static-structure and attribute comparison, warns,
and rebuilds.

## Not implemented (by design)

Octane does not implement:

- class components or legacy `ReactDOM.render` roots;
- Server Components/RSC;
- `StrictMode` double-invoke;
- `Profiler`, `SuspenseList`, `forwardRef`, `createRef`, or `cache()`.

`useDebugValue` is accepted as a no-op. Resource hints are supported
(`preload`, `preinit`, `preconnect`, and `prefetchDNS`).

React 19 custom-element listener semantics are also supported: a
function-valued lowercase `on*` prop on a custom element attaches a real
listener (adjudicated 2026-07-05). The property-versus-attribute heuristic is
not; custom-element values follow Octane's attribute-only pass-through policy.
