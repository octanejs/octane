# Strong compiler checks

Put `"use strong"` before imports, or enable `compiler: { strong: true }` for
application-owned modules. Dependencies keep their own mode. These checks apply
to client, server, and editor compilation. Compatibility modules continue to
support explicit dependencies, manual memo hooks, and ordinary raw HTML props.

## Effects, state, and dependencies

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_EFFECT_STATE_UPDATE` | Effect setup calls a state updater synchronously. This includes updaters and callbacks returned by same-module custom hooks, and callbacks that run before the next paint: `startTransition`, a `useTransition` start function, `queueMicrotask`, `.then`/`.catch`/`.finally` on `Promise.resolve(value)` or `Promise.reject()`, `setTimeout` without a positive delay, and code after an `await` that resumes without waiting on any path, such as `await null` or `await (flag ? load() : null)`. | Derive the value during render, or use `useLinkedState` when state follows another value. `requestAnimationFrame`, timers with a positive delay, and external subscription callbacks remain event-driven. |
| `OCTANE_STRONG_EFFECT_DATA_FETCH` | A state update runs after an `await`, or in a `.then`, `.catch`, or `.finally` callback, of work the effect started, and the returned cleanup does not provably cancel or ignore it. An async effect callback returns a promise, so it cannot return cleanup. | Read asynchronous render data with `use()` or a query binding. For external synchronization, abort an `AbortController` whose `signal` is passed to the request, or set a flag declared in the effect from its cleanup and check it before the update. See [Effect cleanup](#effect-cleanup). |
| `OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY` | Synchronous effect setup calls a state getter, reads `current` from a value ref, or reads a reassigned module `let` or `var`. None of these is an inferred dependency, so the effect does not re-run when they change. | Read the render snapshot, or move the non-reactive read into a `useEffectEvent` callback. Octane never double-invokes effects, so first-run and `didInit` guards are unnecessary. |
| `OCTANE_STRONG_EFFECT_RESOURCE_LEAK` | Effect setup acquires a platform listener, timer, observer, connection, or geolocation watch that the returned cleanup does not release. | Release it in the returned cleanup; see [Effect cleanup](#effect-cleanup). |
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

These are bounded source checks. They follow supported local aliases, known
callbacks, and state tuples, updaters, callbacks, and transition starts
returned by same-module custom hooks. They do not prove arbitrary imported
functions or mutable containers. External subscriptions, event-driven updates,
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

## Effect cleanup

Returning a cleanup function is not enough. Strong checks what the cleanup
does to the work that the effect started during that run.

An asynchronous state update is cancelled or ignored when one of these holds:

- The cleanup calls `abort()` on an `AbortController` created in the effect,
  and the controller's `signal` reaches the request whose result the update
  follows: the most recent awaited request, or one whose result it reads, as in
  `response.json()`. Where branches meet, every path must carry the signal. The
  signal can be passed directly, through
  `const { signal } = controller`, in an options object, or through a
  same-module helper's parameter. The controller itself can also be passed to
  the request, or to a same-module helper that reads its `signal` or calls
  `abort()`.
  `controller.signal.aborted` also works as a guard.
- The cleanup assigns a flag declared with `let` inside the effect, and the
  update is guarded by that flag after the last `await` or at the start of the
  promise callback. The guard can be `if (!ignore) setData(data)`,
  `if (ignore) return;`, or `active && setData(data)`. A flag declared in the
  component or module, or held in a ref, is shared by every run of the effect
  and does not count.

```tsx
"use strong";
import { useEffect, useState } from 'octane';
import { api } from './api';

export function Profile({ id }) {
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    let ignore = false;
    api.profile(id).then((next) => {
      if (!ignore) setProfile(next);
    });
    return () => {
      ignore = true;
    };
  });
  return <p>{profile?.name}</p>;
}
```

A platform resource acquired during synchronous setup must be released by the
returned cleanup:

| Acquired in setup | Released in cleanup |
| --- | --- |
| `addEventListener` on `window` (including the global function), `document`, their properties and query results, a `matchMedia` list, an element held by a ref attached to an intrinsic element, or a connection created in the effect, whether called directly, through a destructured property, or through a same-module helper | `removeEventListener` with the same target, event type, handler identity, and capture flag, or `abort()` on the `AbortController` whose `signal` was passed in the listener options. Options and controllers are followed through stable aliases and same-module helper arguments. |
| An `on<event>` handler property on one of those targets, or the global one such as `onresize` | Assigning the property again, such as `null`, or closing the connection |
| `setInterval`, or a `setTimeout` or `requestAnimationFrame` callback that schedules itself again | `clearInterval`, `clearTimeout`, or `cancelAnimationFrame` with the stored ID; a self-rescheduling timer must store every ID in that variable |
| `ResizeObserver`, `IntersectionObserver`, `MutationObserver`, or `PerformanceObserver` | `disconnect()` or `unobserve()` |
| `WebSocket`, `EventSource`, or `BroadcastChannel` | `close()` |
| `navigator.geolocation.watchPosition` | `navigator.geolocation.clearWatch(id)` |

Only platform APIs count. `store.subscribe(listener)` and `addEventListener` on
a user object stay legal without a visible release, as do one-shot timers and
`requestAnimationFrame` callbacks.

The proofs stay bounded. A cleanup returned on any path counts, the cleanup's
own conditions are not evaluated, and aborting a request does not stop its
`.catch` handler from running: guard updates there with the flag or
`signal.aborted`. An imported helper is opaque, so a resource it acquires
internally is not seen, and neither is a cleanup it returns. Work started after
an `await`, or in a timer or subscription callback, is not checked for resource
release.

A value ref is a `useRef` object whose identity is only used for property
access, stable aliases, and explicit dependency lists. Attaching it with a
`ref` attribute, passing it to a call, component, or hook, storing it in a
container, or returning it makes it an instance ref, which effect setup may
read.

## State values, updaters, and subscriptions

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_IMPURE_UPDATER` | A `useState` or `useLinkedState` updater, a `useReducer` reducer, or a `useOptimistic` reducer calls `fetch`, schedules a timer, microtask, or promise callback, updates state, calls a state getter or Effect Event, reads or writes `useRef.current`, reads a browser global or reassigned module variable, or calls `Date.now()`, `Math.random()`, `performance.now()`, or `new Date()`. Inline functions, local and same-module declarations, and synchronous helpers are followed. | Do the side effect or nondeterministic read in the event handler, effect, or Action, and pass its result in: `const now = Date.now(); setValue((current) => current + now)`. |
| `OCTANE_STRONG_SNAPSHOT_MUTATION` | A state value is mutated outside render: in an event handler, effect, cleanup, deferred callback, or an updater or reducer's own state argument. Covers assignments, updates, `delete`, destructuring targets, `Object.assign` and `Reflect.set`-style targets, array mutators on state initialized with an array literal (including nested literal properties), and `Map`/`Set` mutators on state created with `new Map()` or `new Set()`. | Pass a new value, for example `setItems([...items, item])` or `setItems((current) => [...current, item])`. Keep mutable objects in `useRef`. |
| `OCTANE_STRONG_STALE_STATE_UPDATE` | After an `await`, or in a timer or promise callback, a setter or dispatch argument reads the render snapshot of the same state, including through a local computed from it, a copied alias, or a closure. | Use the updater form, `setValue((current) => current + 1)`, compute from the state a reducer receives, or read the latest value with the state getter (the third tuple member). |
| `OCTANE_STRONG_WRITE_ONLY_STATE` | A state tuple whose value is elided, unused, or read only to compute its own next value, whose getter is absent or unused, and whose setter is used. This is the force-update pattern, including `useReducer((x) => x + 1, 0)` and `useState(0)[1]`. | Subscribe with `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` and render its snapshot, or remove the unused state. |
| `OCTANE_STRONG_UNCACHED_STORE_SNAPSHOT` | Every return of a `useSyncExternalStore` `getSnapshot` or `getServerSnapshot` provably allocates: an object or array literal (including spreads), `.map()`, `.filter()`, or another array copy, `Object.keys()`-style results, a standard constructor, or a same-module function or local constant that does so. | Return a value the store keeps, such as its current state object, or read each field with its own `useSyncExternalStore` call. |

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
cannot prove. An Effect Event reads the latest committed values, so state it
captures is current in its body and in helpers it calls synchronously. A
snapshot passed to it from deferred code is still checked, including values
computed from that argument, as is state read in a timer or promise callback it
creates.

A write-only state tuple exists only to schedule renders for an external
source. It reads that source during render and subscribes afterwards, so a
change between render and subscription is never rendered. `useSyncExternalStore`
re-checks the snapshot after commit and when it subscribes, and it takes a
server snapshot for SSR and hydration.

`useSyncExternalStore` compares snapshots with `Object.is`. A `getSnapshot`
that allocates on every call makes every read look like a store change:
development builds warn once, then renders repeat until the update-depth limit
throws. The compile error reports it before the component runs. Strong
declaration caching does not cache an inline `subscribe` such as
`(notify) => store.subscribe(notify)`, so a new function subscribes again on
every render; define `subscribe` outside the component or pass a stable store
method.

```tsx
"use strong";
import { useState, useSyncExternalStore } from 'octane';
import { cart } from './cart';

const EMPTY = [];
function subscribe(notify) {
  return cart.subscribe(notify);
}

export function Cart({ save }) {
  const [saved, setSaved] = useState(0);
  const items = useSyncExternalStore(subscribe, () => cart.items, () => EMPTY);
  return (
    <button onClick={async () => {
      await save(items);
      setSaved((current) => current + 1);
    }}>
      {items.length} items, saved {saved} times
    </button>
  );
}
```

These are bounded source checks. They follow supported aliases, namespace
imports, optional calls, local closures, and same-module declarations. Imported
functions and methods on arbitrary objects remain opaque.

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
