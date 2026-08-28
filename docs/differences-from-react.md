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

A one-level method call tracks the value that can change between renders. The
compiled array selects that value on each render, based on where the method
lives:

- An own function property tracks itself: `props.onChange(...)` tracks
  `props.onChange`.
- An inherited method tracks its receiver: `count.toFixed(2)` tracks `count`,
  because `Number.prototype.toFixed` is one function for every number.
- An absent handler in an optional call tracks a stable `undefined`:
  `props.onReady?.()` does not re-run its hook until a handler is passed.

Deeper calls such as `cart.items.push(x)` track their receiver path
(`cart.items`), unchanged.

Some closures declare that their body runs in another context, not during
render. A directive from a known list marks them: `'use gpu'` (TypeGPU shader
code) and `'worklet'` (Reanimated UI-thread code). Inside such a closure, the
inferred array tracks only the root variables it captures and reads none of
their properties:

```tsx
const pipeline = useMemo(() =>
  root.createRenderPipeline({
    fragment: () => {
      'use gpu';
      return timeUniform.$; // legal only in shader code — never read at render
    },
  }),
); // Inferred: [root, timeUniform]
```

The list is deliberate. Same-context hints (`'use strict'`, React Compiler's
`'use memo'`/`'use no memo'`) and markers with their own semantics
(`'use server'`, `'use cache'`) do not truncate.

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

Production builds automatically memoize component regions. The default
compatibility mode is conservative about calls whose receivers can hide mutable
state:

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

In compatibility mode, member calls fail closed because the receiver may be a live object:
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

This preserves ordinary React rendering for live receivers; it is not a promise
to reproduce every React Compiler optimization. React Compiler also identifies
APIs with interior mutability, including TanStack Table v8, as
[incompatible with memoization](https://react.dev/reference/eslint-plugin-react-hooks/lints/incompatible-library).
Stable function or object identity alone does not prove a result is unchanged.
React Compiler lint classifications and option-sensitive output are useful
comparison evidence, not Octane configuration: changing JSX outlining, adding a
debug hook, or using React's `"use memo"` directives does not alter Octane's
compatibility/Strong boundary.

### Strong mode and render calls

A module that opts into [`"use strong"`](#optional-strong-mode) asserts a stricter
contract: rendering is a referentially transparent projection of props, state,
context, and immutable snapshots. Every user-authored call evaluated for render
output must return the same value for the same witnessed inputs and must not
perform application-visible work. That assertion covers local and imported
functions, static and computed methods, call-produced callees, constructors,
tagged templates, and synchronously invoked callbacks.

Production client builds can therefore condition eligible regions on their
witnessed inputs without using `use*` spelling as a purity oracle. An ordinary
function named `useFormat` is no less memoizable than `format`; Strong does not
reintroduce React's Rules of Hooks through a naming heuristic. Actual hooks keep
their compiler-owned setup semantics. The compiler recognizes built-in hooks by
import provenance, including optional calls, and resolves same-module
custom-hook declarations and function-valued module bindings by lexical binding.
Transitive and cyclic paths reach a fixed point, while reassigned module bindings
stay on the conservative setup path. Their context subscriptions, state cells,
suspension points, and effect lifecycles remain outside ordinary projection
caches.

For an eligible operation, the cache guard witnesses the callable and its
receiver as well as explicit arguments. A derived receiver such as
`factory().read(input)` is represented by the factory, its receiver, and its
arguments rather than by a transient returned-object identity. Witnesses use
`Object.is` equality at component and ordinary-list projection boundaries, so
repeated `NaN` is stable while `0` and `-0` invalidate separately. A certified
keyed-selection operand retains the authored strict-equality semantics while
other list captures still use `Object.is`. Hiding hook state, a state getter,
`ref.current`, a clock or random
value, mutable module state, or an external live store behind a render call
violates the assertion because the result can change without a witnessed input
changing.

Compiler diagnostics catch a useful subset of violations, but they are not a
whole-program proof and unknown call shapes do not fall back to compatibility
behavior. Calling imported code from a Strong module asserts that the particular
render use is snapshot-safe; it does not make the library's live objects
immutable. Keep a consumer of live accessors in compatibility mode, or read an
actual reactive snapshot and pass it into a separate Strong component.

Compatibility keeps a member call live only while the render scope containing
that call actually executes. It does not create a subscription and cannot make a
stable live object safe across `memo`, an unchanged child boundary, or Strong
memoization. The supported migration is to subscribe and select in compatibility
code, then cross the Strong boundary with the selected value:

```tsx
// SelectionBridge.tsrx — compatibility mode
function SelectionBridge({ table, row }) @{
  <table.Subscribe
    source={table.atoms.rowSelection}
    selector={(selection) => !!selection[row.id]}
  >
    {(selected) => <StrongSelectionRow label={row.original.name} selected={selected} />}
  </table.Subscribe>
}
```

```tsx
// StrongSelectionRow.tsrx
"use strong";

function StrongSelectionRow({ label, selected }) @{
  <li data-selected={selected ? '1' : '0'}>{label}</li>
}
```

Passing only `row`, shallow-copying an object that still contains its live
methods, or forcing an unrelated render without selecting `selected` does not
create a snapshot witness.

### Keyed rows and logging

A key preserves a surviving row's DOM identity; it does not promise that its
JavaScript body runs only once. In Strong production builds, diagnostic calls
such as `console.log('row', item.id)` do not disqualify an otherwise eligible
row from reuse. Do not rely on logging, metrics, mutation, allocation, or any
other render-time call count: evaluation can differ in production, development,
HMR, profiling, server rendering, hydration, retries, and aborted work.

A changed captured value still invalidates a row, including captures inside its
event handlers:

```tsx
onClick={() => setItems(items.filter((entry) => entry.id !== item.id))}
```

Appending changes `items`, so surviving rows must receive a handler for the new
snapshot. Skipping that update could make removing an original row also discard
the appended item. If removal should use the latest state, a functional update
does not capture the parent array:

```tsx
onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
```

The first form remains correct and supported. Strong mode does not change its
closure semantics or promise to skip its reevaluation.

### Local mutation and retained rows

Mutation of fresh render-local data is supported when it finishes before that
data escapes. A plain JavaScript loop has normal sequential JavaScript semantics:

```tsx
function Labels({ items }) @{
  const labels = [];
  for (const item of items) labels.push(item.label);
  <p>{labels.join(', ')}</p>
}
```

A keyed `@for` body is different: every surviving key owns a retained render
scope that may be evaluated independently. Writing a binding declared outside
the row would make its output depend on which other rows happened to run and in
what order. Strong reports that shape as
`OCTANE_STRONG_RETAINED_ROW_MUTATION`:

```tsx
let position = 0;
@for (const item of items; key item.id) {
  position++; // Strong compile error: shared across retained rows.
  <li>{String(position)}</li>
}
```

Use setup to build a complete value before it escapes, keep mutable scratch data
inside one row, or use the directive's index binding when position is the desired
input:

```tsx
@for (const item of items; index position; key item.id) {
  <li>{String(position + 1)}</li>
}
```

Compatibility mode accepts a cross-row write but does not promise a retained
row evaluation order, so it must not determine rendered output there either.

## Derived values are cached at their declaration

```tsx
const labels = formatRows(rows); // Cached on [rows]: imported projection.
const items = virtualizer.getVirtualItems(); // Not cached: member call.
const visible = todos.filter((todo) => !todo.completed); // Cached only for proven state snapshots.
let freshLabels = formatRows(rows); // Not cached: `let` is an escape hatch.
```

An eligible `const` keeps the same identity until its tracked component-local
inputs change. This lets a region key on the identity of a derived value instead
of seeing a new array or object on every render.

The same callee rule governs declaration caching. In compatibility mode, the virtualizer call must stay
live because its window can move while the virtualizer object keeps the same
identity. Most member calls, including arbitrary `items.filter(...)` calls,
therefore remain uncached.

The production `.tsrx` compiler admits one narrow exception: a native `filter`
projection over a state value created by a genuine `useState([])` call when every
setter use remains private and produces a fresh, provably ordinary array
snapshot. The predicate must only inspect an own data property, and a runtime
guard verifies the array's dense entries, item properties, native methods,
constructor, and species before reusing an unchanged snapshot. Unknown aliases,
mutable receivers, getters, proxies, sparse arrays, overridden methods, custom
species, and unproven predicates retain the existing live path. Use an explicit
`useMemo` when an otherwise unsupported identity needs caching.

Within the same proven component, a single-token class object driven by primitive
state can reuse its existing per-binding change guard. Controlled `value` and
`checked` bindings still reassert their values on every commit.

Also never cached in compatibility mode:

- **Hook-shaped calls.** `const s = useThing()` and
  `const s = unstable_useThing()` conservatively keep their setup live. Strong
  instead recognizes actual built-in hooks by import provenance and same-module
  function or function-valued custom-hook setup by lexical call-graph analysis;
  an unrelated `useFormat()` remains an ordinary pure-call assertion.
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

## Linked state updates without a render-time setter

React sometimes keeps local state in sync with a changing prop by calling a
setter during render:

```tsx
const [previousUserId, setPreviousUserId] = useState(user.id);
const [name, setName] = useState(user.name);

if (previousUserId !== user.id) {
  setPreviousUserId(user.id);
  setName(user.name);
}
```

Octane's `useLinkedState` expresses the same intent directly:

```tsx
const [name, setName] = useLinkedState(user.id, () => user.name);
```

The value remains editable with `setName`. When `user.id` changes, the hook
returns the new name immediately, without an effect, a user setter during
render, or a second render attempt. The calculation receives the previous
`{ source, value }` when a source changes, or `undefined` on the first render,
so it can preserve useful parts of the old value. `sourceEqual` and `valueEqual`
default to `Object.is`; pass custom comparators as an optional third argument.
The tuple also supports the same optional latest-value getter as `useState`.

## Optional Strong mode

Strong mode opts into the immutable render-snapshot contract above and adds
compile-time checks for detectable violations. Opt into one module with a
directive before its imports:

```tsx
"use strong";

import { useLinkedState } from 'octane';
```

Alternatively, enable it across application-owned modules with
`compiler: { strong: true }` in `octane.config.ts`. Installed dependencies stay
in compatibility mode unless their own source opts in.

A Strong module cannot call a state updater during render or synchronously while
setting up an effect, and it cannot assign to `ref.current` during render. The
checks follow provable synchronous calls through `useCallback`, `useEffectEvent`,
and functions returned by analyzable `useMemo` factories. Calling a statically
known Effect Event during render or including it in an explicit hook dependency
list is also a compile error. The hooks themselves remain supported, and other
explicit dependency lists retain their existing meaning.

The compiler also rejects render-time writes through a provable state snapshot
(`OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION`) and direct calls to known
non-idempotent globals such as `Date.now()` and `Math.random()`
(`OCTANE_STRONG_RENDER_IMPURE_CALL`). These checks follow supported aliases and
synchronous helpers; they do not prove arbitrary method bodies or imported code
pure. Lazy state initialization may obtain an initial timestamp or random value.

The directive is also an author assertion for production memoization, not just a
request for diagnostics. Render output must not observe changing data through a
stable ref, state getter, module variable, external store object, or hidden hook.
All user-authored render calls and synchronously invoked callbacks must be pure
for their witnessed inputs. Function names—including `use*` names—do not change
that contract or disable the optimization.

Event handlers, genuinely deferred callbacks, effect cleanup, effects that
synchronize an external system, and normal DOM or timer refs remain supported.
Replace prop-driven state resets with `useLinkedState` instead of calling a
setter during render.

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

## Context: callable provider object, no Consumer

`createContext` returns a context that is itself the provider component —
React 19's `<MyContext value={…}>` form is the native shape, and
`MyContext.Provider` is retained as an identity alias for React-18-shaped
libraries. The render-prop `<MyContext.Consumer>` does not exist and will not
be added: Octane's slot-keyed hooks make `use(MyContext)`/`useContext` legal
behind any condition, which is the pattern Consumer existed to work around.
Read the context in the child (or an inline component) instead.

In development, accessing `.Consumer` logs a one-time migration diagnostic and
still returns `undefined`, so feature probes (`MyContext.Consumer || fallback`)
behave exactly as in production. The upstream Consumer test scenarios that
protect observable behavior (defaults, propagation, bailout, hidden subtrees,
suspended boundaries) are ported with `useContext`-reading components; the
scenarios that exist only to exercise the render-prop API surface are recorded
as non-goals in the parity ledger.

## Document metadata and Float resources

Hoisted `<title>`/`<meta>`/`<link>` follow React 19's model with two
differences:

- **Ownership is per compile site, not per content.** Each authored element
  owns one head element; two components (or two renders of one component list
  item) each rendering `<meta name="description">` produce two tags, where
  React dedupes links by href and treats `<title>` as a singleton. An
  element's tag updates reactively and is removed when its owning scope
  unmounts.
- **`<title>` accepts any children Octane can stringify** — multiple children
  and expressions concatenate. React 19 errors on non-string title children.

Metadata and resources hoist from ANY depth, matching React: an element
nested inside a host partitions out of the body on both the client and the
server, and a hoist inside an `@if` arm registers only while that arm renders.
Two more Fizz-parity behaviors on the server: `<meta charSet>` and
`<meta name="viewport">` serialize at the FRONT of the head (charset first —
parsers only honor it within the first 1024 bytes — then viewport, then
everything else in discovery order), and hoistables authored inside a pending
boundary's fallback are dropped transitively (a completed boundary nested in a
fallback is still fallback territory; the streamed head would outlive the
fallback it came from).

React Float **resources** are supported with React's semantics:

- `<link rel="stylesheet" href precedence>` (no `onLoad`/`onError`) is a
  global resource: deduped by href across the page, hoisted into
  `document.head` with a `data-precedence` attribute, grouped by precedence in
  first-encounter order (later same-precedence sheets append to their group),
  and retained after unmount. First encounter follows tree discovery order —
  parent before child, suspended arms at reveal — so client mounts, SSR, and
  React agree on group order. First instance wins; later differing props do
  not retarget a live sheet.
- `<script async src>` (no children/handlers) hoists and dedupes by src, and
  is likewise never removed.
- `<style href precedence>` is a STYLE RESOURCE: its plain CSS ships by href
  identity, sharing the stylesheet dedupe namespace and precedence-group
  ordering with link resources (`data-precedence`/`data-href` mark the tags).
  The CSS is NOT scoped — every other `<style>` in a component still belongs
  to Octane's scoped-CSS system. Two adaptations: Octane emits one `<style>`
  tag per resource rather than merging same-precedence rules into a single tag
  (grouping and order are preserved), and CSS containing `</style` fails
  closed in SSR with a development diagnostic (raw-text serialization cannot
  escape it; the client inserts via `textContent`, which is always safe).
- `preloadModule`/`preinitModule` join `preload`/`preinit`/`preconnect`/
  `prefetchDNS`.
- Classification is static: a spread-carried `precedence`/`async` keeps the
  ordinary element path, matching the compile-time head-hoist model.
- React's hoist EXCLUSIONS apply: `itemProp`-bearing `<meta>`/`<link>` stay
  with their `itemScope` host; metadata/resources that are direct children
  of `<noscript>` stay in the fallback content (one nesting level today —
  metadata wrapped in a further host INSIDE `<noscript>` still hoists; a
  documented bound, not a contract); and nothing hoists from an SVG lexical
  scope (`foreignObject` children re-enter the HTML rules). One template-model
  bound: `<meta>` inside `<svg>` on a pure client mount is relocated by the
  HTML parser's foreign-content breakout rules — it still never becomes
  document metadata, but it cannot be kept inside the `<svg>` the way React's
  imperative element construction keeps it. SSR serializes it inline correctly.

Out of scope, deliberately: **suspensey commits** (React's
suspend-until-the-stylesheet-loads behavior; Octane inserts the sheet and
continues).

Resource hints share the Float identity model — including React's option
semantics: font preloads always emit `crossorigin=""` (anonymous) regardless of
the caller's value; connection/integrity options seeded by a `preload` carry
onto the matching `preinit`'s real tag (and the server coalesces the redundant
preload out of the head fold); `preconnect` identity includes the CORS mode;
responsive image preloads (`imageSrcSet`) omit the fallback `href`; unknown
option keys are dropped; non-string hrefs warn in development and no-op; and a
module src is ONE executable identity across `preinitModule` and
`<script async type="module" src>` on both the server pass and the hydrating
client. In detail: `preinit(href, {as: 'style'})`
IS a stylesheet resource (it honors a `precedence` option, default
`"default"`, joins the precedence groups, and dedupes against
`<link rel="stylesheet" precedence>`), `preinit(as: 'script')` dedupes against
`<script async src>`, and a `preload`/`preloadModule` issued after the
matching init is a no-op (the upgrade is one-way: preload-then-init keeps both
tags). Image preloads carrying `imageSrcSet` key on the srcset+sizes pair
rather than the fallback href. Malformed calls (missing/invalid `as`, empty
href) warn in development and stay no-ops. Options serialize through their
canonical attributes (`fetchPriority`, `imageSrcSet`, `imageSizes`, `media`,
`integrity`, …); unknown option keys are dropped, matching React.

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

Already-visible Suspense content stays visible without a timeout during a
transition, matching React's
[shell-retention contract](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1356-L1369).
`isPending` stays true until the transition completes or is superseded. Initial
boundaries and newly added nested boundaries may show their fallbacks: there is
no previously visible content for those boundaries to preserve.

`setTransitionFallbackTimeout(ms)` is an Octane extension for applications that
want a finite deadline. After that deadline, the pending fallback replaces the
visible primary while `isPending` remains true. `getTransitionFallbackTimeout()`
returns `Infinity` by default; setting `Infinity` restores the no-timeout policy
for subsequent holds.

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
- Retry-only Suspense reveals follow React's shared 300ms fallback window.
  Showing or filling a fallback advances the window, and retries wait if more
  than 10ms remains. Urgent updates and active `act()` scopes bypass this delay.
  A committed fallback inside hidden Activity contributes to the window;
  toggling Activity visibility alone does not.
  This is separate from the indefinite transition hold above; see
  [Suspense retry timing](../packages/octane/audit/SUSPENSE_DIVERGENCE.md#5-retry-reveal-throttling--distinct-from-transition-shell-retention).
- Resource readers can suspend by throwing a thenable during render, on the
  client and during SSR; `use()` is not required. Pending and error fallback
  renders can also suspend through an enclosing pending boundary. A catch-only
  error boundary does not own suspension; promises thrown by effects remain
  application errors.
- Without an enclosing Suspense/`@pending` boundary, the client root retains its
  committed screen, or stays empty on an initial mount, and retries when the
  thenable settles. Urgent and transition updates retry the latest inputs;
  superseding requests and unmounts cannot reveal stale work. Initially suspended
  hydration retains the server DOM until it can adopt it, attach refs, and run
  layout/passive effects. Actual rejections follow normal
  error-boundary/root-error routing.
  See [root suspension coverage](../packages/octane/audit/SUSPENSE_DIVERGENCE.md#10-client-suspension-without-a-boundary--root-hold-and-retry)
  for the fix to [issue #821](https://github.com/octanejs/octane/issues/821).
- Incomplete descriptor and memoized subtrees retry before Suspense reveals
  them, preserving mounted state and DOM identity. Completed siblings whose
  speculative commit work was discarded are revisited; unaffected memo and
  identity bailouts remain eligible. See
  [descriptor retry coverage](../packages/octane/audit/SUSPENSE_DIVERGENCE.md#11-incomplete-descriptor-retry-bailouts).
- Same-identity synchronous rendering remains per-swap rather than using a
  global React-style work-in-progress tree. See
  [Suspense divergence #4](../packages/octane/audit/SUSPENSE_DIVERGENCE.md).
- Multiple unhandled root errors in one flush throw an `AggregateError`; an
  unhandled error unmounts its root's whole tree (both match React).
- `useSyncExternalStore` skips React's commit-time getSnapshot re-read for
  unchanged values (the concurrent-interleaving window it guards doesn't exist
  here).
- A hidden `<Activity>` subtree renders synchronously in the same pass — there
  is no offscreen/idle lane deprioritizing hidden work. Compatible state and DOM
  are preserved; refs and layout/passive effects disconnect while hidden and
  reconnect on reveal. Insertion effects stay connected. Hidden suspension is
  contained by the Activity, but general structural-deletion atomicity still has
  the per-swap limitation above. See the [Activity audit](./activity-audit.md).
- `useId` generates `:<prefix>in-<n>:` identifiers (React 19.2 uses
  `_r_<n>_`). Both are opaque; only the format differs.
- `version` reports Octane's own package version (`0.x`), not a React version —
  ported code gating on `version >= '19'` must not rely on it.

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

Composition is regression-pinned in `benchmarks/async-composition`, whose
dashboard fixture reads eight resources — seven independent, one truly dependent
— through an imported custom hook and three sibling panels:

| Shape | Current behavior |
| --- | --- |
| Independent `use()` calls inside an imported custom hook | Start together: plain TypeScript custom hooks get the same memoize-and-batch treatment as component-local `use()` |
| Adjacent async children under a parent with no `use()` | Start together: child warm plans register with active ancestors, so the first suspending descendant starts its siblings |
| A transition-wrapped update | Holds the boundary whole: no mixed old/new state, matching React |

All three reach the workload's true dependency floor — 2 waves and 8 requests for
both cold mount and transition update, against React's 6/3 waves and 35/25
requests — so only `owner` waits, on `project.ownerId`, and the update exposes
zero intermediate states, the same as React.

A held boundary holds all of its own content. Octane renders and mutates in one
walk, so a transition patches a boundary's bindings on the way down and only then
finds that a descendant suspends; the same happens when a held boundary replays
its body and part of the data has arrived. Both cases record what each binding
replaced and put it back if the attempt suspends, inside the flush that made the
change — nothing reaches the screen in between. Transitions stay monotonic: no
visible rollback, no invalid intermediate structure, and a dependent value never
renders against stale input.

Controlled `value`, `checked` and `selected` are held too. Each carries a
`default*` mirror and a record of what was last projected, and all of it goes
back together — restoring the node alone would leave the record believing the new
value had already landed, so re-projecting it on resume would be skipped.

A held synchronous transition now defers its whole commit: content the
transition patched outside the suspended boundary — shell text, attributes,
keyed structure — reverts with the hold and lands in one step on resolve, with
`isPending` staying on throughout. `benchmarks/async-composition` pins the
update at zero exposed intermediate states, level with React. One residual is
pinned at its own ceiling there: after the dependent request resolves, the
promoted round re-creates the warm-started panel fetches (13 creations against
the 8-call floor; the app-level cache serves the same promises, so nothing
refetches over the network) until the resume/warm work in
[the deferred-commit plan](./transition-deferred-commit-plan.md) restores the
floor. Both need the transition to become a deferred commit — a keyed
removal disposes blocks and runs their cleanups, which cannot be undone, and
reverting content outside a boundary needs the reveal to re-render where the
transition began rather than just the boundary. See
[Suspense divergence #4](../packages/octane/audit/SUSPENSE_DIVERGENCE.md). The
benchmark pins the exposed-state count at zero.

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

Creating a lazy wrapper does not call its loader. When an independently
reachable sibling suspends, Octane may start the lazy module's existing loader
early so its code loads alongside the pending work. The loader still runs only
once per wrapper, and its resolved component and default-export getter are not
evaluated until that component actually renders. Discovery does not cross a
dormant deferred-hydration boundary.

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
to the enclosing boundary.

React 19's root error-callback options are supported on `createRoot` and
`hydrateRoot`: `onCaughtError` (a boundary claimed an error from the render,
passive-effect, or ref-attach channel), `onUncaughtError` (no boundary claimed
it — providing the callback replaces the default report, which otherwise
rethrows render errors out of the flush and `console.error`s effect-channel
errors; the failed root's tree still unmounts), and `onRecoverableError`
(hydration recovered from a structural mismatch — see the hydration section).
Each callback receives only the error: there is no `errorInfo`/`componentStack`
second argument, matching the documented SSR `onError` shape (owner stacks are
not part of Octane's API). Deletion-phase teardown errors (effect cleanups and
ref detaches thrown while a subtree unmounts) keep their existing boundary
routing and report through the same callbacks: boundary-claimed →
`onCaughtError`, unclaimed → `onUncaughtError` (else the default
`console.error`).

In non-suspending renders, first-mount and parent-driven catches report the
original error once after the fallback commits, including its refs and layout
effects. Inline reports retained by Suspense or Activity wait for reveal, and
are discarded if their catch is abandoned before that commit.

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

### Fragment refs

An explicit `<Fragment ref={ref}>` provides a typed `FragmentInstance` without
adding a wrapper element. This matches React's Canary Fragment-ref API; the
`<>...</>` shorthand cannot accept a ref.

Refs also work through imported aliases, namespace members, JSX spreads, and
`createElement(Fragment, { ref }, ...)` descriptors.

```tsx
import { Fragment, type FragmentInstance, useRef } from 'octane';

function SearchFields() {
  const fields = useRef<FragmentInstance | null>(null);

  return (
    <Fragment ref={fields}>
      <input />
      <button onClick={() => fields.current?.focus()}>Focus first field</button>
    </Fragment>
  );
}
```

`FragmentInstance` exposes `addEventListener`, `removeEventListener`,
`dispatchEvent`, `focus`, `focusLast`, `blur`, `observeUsing`, `unobserveUsing`,
`getClientRects`, `getRootNode`, `compareDocumentPosition`, and
`scrollIntoView`. Event listeners, observers, geometry, and scrolling target the
Fragment's first-level DOM children; focus searches descendants depth-first.
`scrollIntoView` accepts only an optional alignment boolean, not an options
object. First-level children expose their owning instances through
`reactFragments: Set<FragmentInstance>`.

Fragment refs are inactive during server rendering and attach during client
hydration. Octane roots require an `Element`, so React's empty-fragment scrolling
fallbacks for roots mounted directly into a `ShadowRoot` or `DocumentFragment`
are outside the supported root-container surface.

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
It has no Fizz bootstrap-script/module/import-map options, no doctype/preamble
*options* (streaming a `<html>`-rooted document still emits `<!DOCTYPE html>`
automatically), and no `onHeaders` or header-construction options. One `nonce`
covers every inline style and script Octane emits rather than exposing separate
script and style channels. `progressiveChunkSize` does not exist — Octane
flushes per resolution wave, not by byte thresholds — and `namespaceURI` is
inferred from the rendered root rather than accepted as an option.

React 19.2's partial pre-rendering — `resume`, `resumeToPipeableStream`,
`resumeAndPrerender`, and the postpone/prelude protocol — is a non-goal: that
request protocol is not part of Octane's public SSR surface. Relatedly,
`prerender` resolves `{ html, css }` (a complete buffered document), not
React's `{ prelude: ReadableStream }`; `prerenderToNodeStream` is planned but
not yet implemented.

A readable stream's `allReady` settles after all boundary bytes have been
accepted under consumer backpressure, so consumers should read the stream while
awaiting it. Error callbacks report the original value without synthesizing
React digests or React's `errorInfo` shape.

### Hydration

Attribute mismatches recover to the **client** value; React keeps the server
value. Octane warns and rebuilds a mismatched subtree in place rather than
throwing.

`hydrateRoot`'s `onRecoverableError` option fires (dev AND prod) after a
STRUCTURAL recovery — a rebuilt subtree or a discarded stale server range —
coalesced to one report per root per microtask burst. Octane recovers per site
rather than client-rendering a whole boundary, so attribute-level value patches
do not report: production React does not detect those at all, and reporting
Octane's extra detection would make the channel incomparable.

`hydrateRoot` has no `formState` option: resuming `useActionState` from an MPA
form POST requires React's server-action state serialization, which is part of
the RSC model Octane does not implement (the matching `useActionState`
`permalink` argument is accepted for signature parity and ignored).

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

## Hot module updates remount the edited component

React Fast Refresh diffs the new element tree against the existing fiber tree, so
an edit high in the tree can leave untouched descendants exactly where they were,
DOM nodes and state included.

Octane's compiled bodies clone a static template and address it through a
compile-time slot layout, so there is no element tree to diff. A hot update
discards the edited component's committed render state and remounts it in place:

- The component's own `useState`, `useReducer`, `useRef`, and `useId` values
  survive. Hook slots are keyed by
  `Symbol.for('octane:<file>:<Component>.<hook>#<n>')`, and a re-imported module
  produces the same Symbol identity.
- Its memo and effect dependencies are invalidated, so an edited closure runs
  again even when its authored dependency array did not change.
- Everything it rendered is torn down and rebuilt: descendant components, their
  state, their DOM identity, and uncontrolled input values. React would have kept
  the ones the edit did not touch.

A remount inside a hidden `<Activity>` remains hidden. Independently scheduled
descendant renders and Suspense resumes reapply the nearest Activity's hide pass
to any replacement elements or text, including output rebuilt by HMR, and reveal
restores the authored display and text values. Activity and Suspense share hide
ownership for overlapping DOM, so either boundary can reveal first without
exposing the other boundary's content or capturing its temporary hidden styles
as authored state.

Octane declines a refresh when the old and new compiler bodies use incompatible
direct-template and returned-output layouts, or when a live block has no coherent,
exclusively resettable DOM range. The emitted accept block then calls
`import.meta.hot.invalidate()` for a full page reload.

Hook slot ids are numbered per module in source order, so inserting or reordering
a hook call shifts every later hook's key in that file and remaps its state. That
is a known limitation, not a supported edit.

## Not implemented (by design)

Octane does not implement:

- class components or legacy `ReactDOM.render` roots;
- Server Components/RSC, including `cache()`, `cacheSignal()`, and
  `hydrateRoot`'s `formState` option;
- `StrictMode` double-invoke;
- `Profiler`, `SuspenseList`, `forwardRef`, or `createRef`;
- `captureOwnerStack` and development owner-stack collection (diagnostics
  dedupe per rendering block instead);
- `unstable_batchedUpdates` (renders are microtask-batched by default);
- partial pre-rendering (`resume`/`resumeAndPrerender` and the
  postpone/prelude protocol — see SSR and streaming);
- gesture View Transitions (`useSwipeTransition` /
  `unstable_startGestureTransition`), deferred until React stabilizes them.

`useDebugValue` is accepted as a no-op. Resource hints are supported
(`preload`, `preinit`, `preloadModule`, `preinitModule`, `preconnect`, and
`prefetchDNS`).

React 19 custom-element listener semantics are also supported: a
function-valued lowercase `on*` prop on a custom element attaches a real
listener (adjudicated 2026-07-05). The property-versus-attribute heuristic is
not; custom-element values follow Octane's attribute-only pass-through policy.
