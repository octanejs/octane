# Strong compiler checks

Put `"use strong"` before imports, or enable `compiler: { strong: true }` for
application-owned modules. Dependencies keep their own mode. These checks apply
to client, server, and editor compilation. Compatibility modules continue to
support explicit dependencies, manual memo hooks, and ordinary raw HTML props.

## Effects, state, and dependencies

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_EFFECT_STATE_UPDATE` | Effect setup calls a state updater synchronously. This includes updaters and callbacks returned by same-module custom hooks, and callbacks that run before the next paint: `startTransition`, a `useTransition` start function, `queueMicrotask`, `.then`/`.catch`/`.finally` on `Promise.resolve(value)` or `Promise.reject()`, `setTimeout` without a positive delay, and code after awaiting a value that is not a pending promise. | Derive the value during render, or use `useLinkedState` when state follows another value. `requestAnimationFrame`, timers with a positive delay, and external subscription callbacks remain event-driven. |
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
  follows. The signal can be passed directly, through
  `const { signal } = controller`, in an options object, or through a
  same-module helper's parameter. `controller.signal.aborted` also works as a
  guard.
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
| `addEventListener` on `window`, `document`, their properties and query results, a `matchMedia` list, an element held by a ref attached to an intrinsic element, or a connection created in the effect | `removeEventListener` with the same target, event type, handler identity, and capture flag, or `abort()` on the `AbortController` whose `signal` was passed in the listener options |
| An `on<event>` handler property on one of those targets | Assigning the property again, such as `null`, or closing the connection |
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
