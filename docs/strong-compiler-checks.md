# Strong compiler checks

Put `"use strong"` before imports, or enable `compiler: { strong: true }` for
application-owned modules. Dependencies keep their own mode. These checks apply
to client, server, and editor compilation. Compatibility modules continue to
support explicit dependencies, manual memo hooks, and ordinary raw HTML props.

## Effects, state, and dependencies

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_EFFECT_DATA_FETCH` | An effect starts a known fetch and invokes a known state updater in its asynchronous continuation, without returning cleanup. | Read asynchronous render data with `use()`, or implement a cancellable external synchronization with cleanup. |
| `OCTANE_STRONG_EFFECT_CHAIN` | An effect reads state written by another effect's own execution or promise continuation in the same component. | Derive the value during render, use `useLinkedState`, or combine the external synchronization. External subscription and timer callbacks remain event-driven updates. |
| `OCTANE_STRONG_UNLINKED_PROP_STATE` | An eager `useState` initializer or two-argument `useReducer` initial state is derived from component props. | Use `useLinkedState(source, reconcile)` for state that follows a source. Use `useState(() => initialValue)` or an explicit third `useReducer` initializer for a deliberate initial capture. |
| `OCTANE_STRONG_EXPLICIT_DEPENDENCIES` | An explicit dependency argument differs from the compiler's inferred inputs, or cannot be proven equivalent. | Omit the dependency argument. An equivalent array produces a **hint**, not an error; its authored behavior is preserved. |
| `OCTANE_STRONG_UNTRACKED_EFFECT` | A built-in dependency hook receives `null` dependencies. | Omit the argument so the compiler tracks reactive inputs. |
| `OCTANE_STRONG_MANUAL_MEMO` | A call to Octane's `useMemo` or `useCallback`, including known import aliases. | Write a normal calculation or callback declaration and let Strong compilation cache eligible declarations. |

Dependency comparison uses the same lexical analysis as inference, including
stable hook values and Effect Event exclusions. When dependency values are also
observable callback arguments, their order and duplicates matter. A dynamic
array is not an equivalent-list proof. An unshadowed `undefined` dependency
argument counts as omission in Strong mode and receives inferred tracking.
`octane analyze` reports equivalent-list
hints without failing `--strict`.

Strong compilation caches eligible `const` object and array allocations and
callbacks inside module-level synchronous functions. Every use must belong to
an authored effect or another supported dependency hook. Their identities remain
stable until inferred inputs change, in development and production. This pass
does not cache arbitrary calculations, calls, constructors, tagged templates,
spreads, values passed to unknown helpers, or values used only by JSX.

The full compiler also follows stable local custom hooks when it can prove that
an input is used only by an effect and the call has an existing hook slot.
Opaque imported custom hooks do not provide that proof. In plain JavaScript or
TypeScript modules, a custom hook's own effect inputs can qualify; arguments to
local custom-hook calls are not covered by this new cache.

Mutable values, late captures, unused declarations, and locals inside event
handlers, render props, nested callbacks, or iteration bodies keep their authored
evaluation and lifetime. Direct `eval` in the same function prevents this new
caching. Unrelated `eval`, overloads, abstract classes, and hashbangs remain valid
in plain modules, whose source is edited only at the relevant hook ranges.
The `manualSlots` integration option cannot allocate these additional caches;
an eligible declaration in such a module reports
`OCTANE_STRONG_AUTOMATIC_MEMO_UNSUPPORTED`.

These are bounded source checks. They follow supported local aliases and known
callbacks; they do not prove arbitrary imported functions, mutable containers,
or all asynchronous data flow. An effect returning cleanup still needs to cancel
or ignore stale results correctly. External subscriptions, event-driven updates,
and effect cleanup remain supported.

```tsx
"use strong";
import { useEffect, useLinkedState } from 'octane';
import { subscribe } from './connection';

export function Editor({ user }) {
  const [name, setName] = useLinkedState(user.id, () => user.name);
  useEffect(() => subscribe(user.id)); // subscribe returns its cleanup
  return <input value={name} onInput={event => setName(event.currentTarget.value)} />;
}
```

## State values, updaters, and subscriptions

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_IMPURE_UPDATER` | A `useState` or `useLinkedState` updater, a `useReducer` reducer, or a `useOptimistic` reducer calls `fetch`, schedules a timer, microtask, or promise callback, updates state, calls a state getter or Effect Event, reads or writes `useRef.current`, reads a browser global or reassigned module variable, or calls `Date.now()`, `Math.random()`, `performance.now()`, or `new Date()`. Inline functions, local and same-module declarations, and synchronous helpers are followed. | Do the side effect or nondeterministic read in the event handler, effect, or Action, and pass its result in: `const now = Date.now(); setValue((current) => current + now)`. |
| `OCTANE_STRONG_SNAPSHOT_MUTATION` | A state value is mutated outside render: in an event handler, effect, cleanup, deferred callback, or an updater or reducer's own state argument. Covers assignments, updates, `delete`, destructuring targets, `Object.assign` and `Reflect.set`-style targets, array mutators on state initialized with an array literal (including nested literal properties), and `Map`/`Set` mutators on state created with `new Map()` or `new Set()`. | Pass a new value, for example `setItems([...items, item])` or `setItems((current) => [...current, item])`. Keep mutable objects in `useRef`. |
| `OCTANE_STRONG_STALE_STATE_UPDATE` | After an `await`, or in a timer or promise callback, a setter or dispatch argument reads the render snapshot of the same state, including through a local computed from it, a copied alias, or a closure. | Use the updater form, `setValue((current) => current + 1)`, compute from the state a reducer receives, or read the latest value with the state getter (the third tuple member). |
| `OCTANE_STRONG_WRITE_ONLY_STATE` | A state tuple whose value is elided, unused, or read only to compute its own next value, whose getter is absent or unused, and whose setter is used. This is the force-update pattern, including `useReducer((x) => x + 1, 0)` and `useState(0)[1]`. | Subscribe with `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` and render its snapshot, or remove the unused state. |

Octane evaluates queued updaters and reducers while their owner renders, and it
can run the same function more than once. A functional update staged by a
transition is evaluated when it is scheduled and again when the transition
renders. An urgent functional update made while a transition is held is applied
to the committed value and then rebased onto the held value. `useOptimistic`
re-applies its reducer on each render while an Action is pending. Updaters and
reducers therefore follow the render checks; diagnostic logging remains valid.

Mutation outside render has its own code because it fails differently from a
render-time mutation, which keeps `OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION`.
Passing a mutated array back to its setter is an `Object.is` no-op, so nothing
re-renders. Copying only the outer object re-renders the owner, but consumers
keyed on the inner identity, such as a `memo` child, stay stale, and the
mutation rewrites the value that transitions and `useOptimistic` revert to.

A state update is deferred when it runs after an `await` that every path
reaches, or inside a callback passed to an unshadowed `setTimeout`,
`setInterval`, `requestAnimationFrame`, `requestIdleCallback`, or
`queueMicrotask` (including through `window` or `globalThis`), or to `.then()`,
`.catch()`, or `.finally()`. Other state can change before it runs, so a value
computed from the render snapshot can overwrite a newer update. A synchronous
handler such as `onClick={() => setCount(count + 1)}` remains valid, as do
updates in subscription callbacks and other callbacks whose timing the compiler
cannot prove.

A write-only state tuple exists only to schedule renders for an external
source. It reads that source during render and subscribes afterwards, so a
change between render and subscription is never rendered. `useSyncExternalStore`
re-checks the snapshot after commit and when it subscribes, and it takes a
server snapshot for SSR and hydration.

These are bounded source checks. They follow supported aliases, namespace
imports, optional calls, local closures, and same-module declarations. Imported
functions and methods on arbitrary objects remain opaque.

## Render determinism

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_RENDER_IMPURE_CALL` | Unshadowed `Date.now()`, `Math.random()`, `performance.now()`, `Date()`, `new Date()`, `crypto.randomUUID()`, or `crypto.getRandomValues()` during render, including inside callbacks that known array methods run synchronously. A `key` or `@for` key built from one of these gets its own message. | Read time or randomness outside render and pass a snapshot. Use `useId()` for element IDs. Give each list item a stable ID from its data, such as `item.id`. |
| `OCTANE_STRONG_RENDER_LOCALE_FORMAT` | During render, `toLocaleString()`, `toLocaleDateString()`, or `toLocaleTimeString()` on a provable `Date` without both a locale and a visible `timeZone` option; `toString()` or `toTimeString()` on a provable `Date`; an `Intl` service constructed without a locale (a `DateTimeFormat` also needs a `timeZone`); or a call on a module-level formatter created that way. | Pass an explicit locale and time zone, for example `toLocaleString('en-US', { timeZone: 'UTC' })` or `new Intl.DateTimeFormat(locale, { timeZone })`. Otherwise format in an event or effect and render the stored text. |

The array methods whose callbacks run in the caller's phase are `every`,
`filter`, `find`, `findIndex`, `findLast`, `findLastIndex`, `flatMap`,
`forEach`, `map`, `reduce`, `reduceRight`, `some`, `sort`, `toSorted`, and the
mapping function of `Array.from`. During render every other render rule applies
inside them too, so `items.forEach(setSelected)` is a render state update. The
same callbacks in events, effects, and lazy state initializers keep their
existing rules.

A `Date` is provable when it is built with `new Date(...)` from an unshadowed
`Date`, directly or through an unreassigned local alias. A date passed as a prop
is not provable. Formatting a date built from local parts with `toDateString()`
gives the same text in every time zone and stays valid. The `Intl` check covers
`Collator`, `DateTimeFormat`, `DisplayNames`, `DurationFormat`, `ListFormat`,
`NumberFormat`, `PluralRules`, `RelativeTimeFormat`, and `Segmenter`, with or
without `new`. An options value the compiler cannot see, such as an identifier,
is not reported.

## Lists, host props, and compatibility APIs

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_MAP_JSX` | In `.tsrx`, a `.map()` callback returns JSX, including known local callback aliases. | Use `@for` with a stable item key. Data-only mapping and keyed JSX mapping in `.tsx` remain valid. |
| `OCTANE_STRONG_INDEX_KEY` | An `@for` key uses the loop position as its identity, including arithmetic or text derived from the index. | Use an item ID that survives insertion, removal, and reordering. Looking up an item ID, such as `items[index].id`, remains valid. |
| `OCTANE_STRONG_SUPPRESSION_PROP` | A DOM intrinsic uses `suppressHydrationWarning` or `suppressNativeChangeWarning`, including statically visible object spreads. | Fix the mismatch or use the intended native event. Component props with these names are unaffected. |
| `OCTANE_NATIVE_TEXT_ONCHANGE` | The existing native text `onChange` warning, promoted to an error. | Use `onInput` for per-edit changes. Native checkbox, radio, and select `onChange` semantics stay valid. |
| `OCTANE_STRONG_COMPAT_IMPORT` | Imports or known namespace accesses for `flushSync`, `unstable_batchedUpdates`, or `StrictMode` from `octane`. | Use normal Octane scheduling and component semantics. |

```tsrx
export function Rows({ items }) @{
  <ul>
    @for (const item of items; index position; key item.id) {
      <li>{position as string}: {item.name as string}</li>
    }
  </ul>
}
```

The `@for` directive is `.tsrx` syntax. Strong `.tsx` modules keep standard JSX
lists such as `items.map(item => <Row key={item.id} item={item} />)`.

The event check retains the existing DOM ownership and input-type analysis.
Dynamic spreads and dynamic input types may need the existing development
runtime diagnostic. Strong mode adds no runtime phase guards.

## DOM ownership

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_MANAGED_DOM_WRITE` | A write through a ref to what the template owns on its element: `textContent`, `innerText`, `append`, `appendChild`, `insertBefore`, `prepend`, `removeChild`, `replaceChild`, or `replaceChildren` when the template renders children; `className`, `classList` mutators, or `classList.value` when it sets a class; `setAttribute`, `removeAttribute`, or `toggleAttribute` for an attribute it sets; `style`, `style.cssText`, or a `style` property it sets. | Render the value from state or props in the template. |
| `OCTANE_STRONG_RAW_HTML_WRITE` | `innerHTML`, `outerHTML`, `insertAdjacentHTML()`, or `setHTMLUnsafe()` on an element Octane renders. | `dangerouslySetInnerHTML={trustHTML(html)}` for trusted or already sanitized HTML. |
| `OCTANE_STRONG_OWN_MARKUP_QUERY` | `document.getElementById()`, `querySelector()`, `querySelectorAll()`, or `getElementsByClassName()` with a literal selector that matches a literal `id` or class rendered by the same component. | Attach a ref to the element and use `ref.current` in the event or effect. |

A DOM write is reported only when the ref provably names exactly one intrinsic
DOM element in the same component. The ref must come from `useRef` in the
function (or keyed `@for` row) that renders the element. It may be used only as
that element's `ref` prop, including inside a `ref={[a, b]}` list, and through
`.current` reads, `const { current } = ref`, and unreassigned local aliases. Any
other use withdraws the proof: a component's `ref` prop, an argument to a helper,
a `.current` assignment, or a second element. An inline callback ref's parameter
is that element. Writes in effects, layout effects, event handlers, and nested
helpers are all checked. Writes that the template does not own stay valid, such
as `textContent` on an element without rendered children, mounting a third-party
widget into an empty container, a `style` property the template's `style` does
not set, `focus()`, and measurement.

Queries are matched only for a single compound selector, such as `#id`, `.class`,
or `li.item.active`, against literal `id` and `class` values. A string element of
a `class` array counts as literal. Portal targets and markup rendered by another
component are not matched. Nor are dynamic selectors, selectors with combinators,
or element-scoped queries such as `panel.querySelector()`.

```tsx
"use strong";
import { useEffect, useRef } from 'octane';

export function Search({ open }) {
  const input = useRef(null);
  useEffect(() => {
    if (open) input.current.focus();
  });
  return <input ref={input} className={open ? 'search open' : 'search'} />;
}
```

## Trusted HTML

`OCTANE_STRONG_UNTRUSTED_HTML` rejects visibly raw values supplied to a Strong
DOM intrinsic's `dangerouslySetInnerHTML`. The `TrustedHTML` type and `trustHTML`
helper declare an explicit HTML trust boundary:

```tsx
"use strong";
import { trustHTML } from 'octane';
import { sanitize } from './html-policy';

export function Article({ html }) {
  const trusted = trustHTML(sanitize(html));
  return <article dangerouslySetInnerHTML={trusted} />;
}
```

**`trustHTML` does not sanitize HTML.** Call it only after applying the
application's sanitization policy or when the input is already trusted. It
returns the existing `{ __html: string }` host-prop shape with a TypeScript brand;
there are no per-node runtime brand checks, extra DOM wrappers, or changes to
server serialization and hydration.

Strong `.tsrx` editor/type checking automatically selects the nominal Strong
JSX types, so imported values and props also need the brand. When checking plain
`.tsx` directly with TypeScript, use `/** @jsxImportSource octane/strong */` or
set `jsxImportSource` to `octane/strong`. The string directive alone cannot
change TypeScript's JSX namespace. `null` and `undefined` remain valid empty
values; custom component props and foreign renderer JSX keep their own types.

The syntax compiler cannot establish the type of an arbitrary imported value or
dynamic factory prop. Run the project's `tsrx-tsc --noEmit` check as well as its
build. Type assertions and `any` can bypass nominal checking, as with other
TypeScript contracts.
