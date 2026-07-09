# Skill: Bridge a React package to Octane

Use this when a user wants a React ecosystem library to work in their Octane app.

## Check for an official binding first

These libraries already have maintained Octane ports. Install the binding instead
of bridging by hand:

| React package | Octane binding |
| --- | --- |
| `zustand` | `@octanejs/zustand` |
| `@tanstack/react-query` | `@octanejs/tanstack-query` |
| `framer-motion` / `motion` | `@octanejs/motion` |
| `@stylexjs/stylex` | `@octanejs/stylex` |
| `react-router` / `react-router-dom` | `@octanejs/tanstack-router` |
| `@lexical/react` | `@octanejs/lexical` |
| `@floating-ui/react` | `@octanejs/floating-ui` |
| `radix-ui` | `@octanejs/radix` |

For anything else, run the `octane_bridge_react_package` tool to get a scan of the
package's React API usage and a tailored plan, then follow the workflow below.

## Mental model

Octane is a compiler framework, not a runtime VDOM. Two consequences drive
everything:

1. Compiled React JSX (`jsx()` / `createElement` trees) cannot render on Octane.
   Components must be authored in `.tsrx` (or `.tsx` compiled by the Octane
   compiler).
2. Every Octane hook call is bound to a compiler-injected slot. A slotless
   `useState(0)` coming from a React build throws immediately.

So a bridge never means "run the React package unchanged". It means:

- Reuse the package's framework-agnostic core verbatim (store, query client,
  state machine, form engine). Code with zero `react` imports runs on Octane
  as-is.
- Re-implement the thin React binding layer (usually a handful of hooks) against
  Octane's identically named hooks.
- Re-author any shipped JSX components in `.tsrx`.

## Workflow

1. **Classify the library.** Find its vanilla core (`zustand/vanilla`,
   `@tanstack/query-core`, `jotai/vanilla`, `xstate`, `@floating-ui/dom`, a
   `*-core` dependency, or a pure internal module). Identify the React surface:
   hooks, components, providers, portals, refs.

2. **Map the React APIs.** Same-name and same-semantics in Octane: `useState`,
   `useReducer`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`,
   `useCallback`, `useRef`, `useContext`, `useId`, `useImperativeHandle`,
   `useSyncExternalStore` (full React 19 shape, including `getServerSnapshot`),
   `useTransition`, `useDeferredValue`, `useActionState`, `useOptimistic`,
   `useEffectEvent`, `use`, `startTransition`, `memo`, `createContext`,
   `Suspense`, `createPortal`, `flushSync`, `createRoot`, `hydrateRoot`.
   Everything imports from `octane` (no separate `react-dom`).

3. **Handle the gaps:**
   - `forwardRef`: does not exist. Accept `ref` as a normal prop (React 19
     style) and drop the wrapper.
   - `useDebugValue`: shim as a no-op.
   - `lazy`: use dynamic `import()` plus `use()` inside a `Suspense` boundary.
   - Class components: rewrite as function components. Error boundary classes
     become `<ErrorBoundary>` or the `@try { } @catch (e) { }` directive.
   - Synthetic `onChange` on text inputs: use native `onInput`. Octane events
     are native and delegated.
   - Controlled inputs: Octane inputs are uncontrolled and native; `value` and
     `checked` are plain attributes. Port controlled-input logic to
     read-from-DOM plus explicit writes, or keep state in the store and write
     the attribute on change.
   - StrictMode double-invoke: does not exist; delete test expectations that
     count double renders.

4. **Custom hooks in plain `.ts` files.** Octane's compiler auto-slots hook
   calls in files it compiles. A binding published as plain `.ts` that calls
   hooks internally must forward the caller's slot: accept a trailing `slot`
   argument and derive stable child slots per call site. The convention used by
   the official bindings:

   ```ts
   import { useMemo, useRef } from 'octane';

   export function subSlot(slot: symbol | undefined, tag: string) {
   	return slot !== undefined ? Symbol.for((slot.description ?? '') + ':' + tag) : undefined;
   }

   export function useControllableState(opts, slot?: symbol) {
   	const valueRef = useRef(opts.defaultValue, subSlot(slot, 'value'));
   	return useMemo(() => build(valueRef), [opts.value], subSlot(slot, 'memo'));
   }
   ```

   Callers compiled from `.tsrx`/`.tsx` pass their injected slot automatically as
   the trailing argument when the hook file itself is excluded from the compiler's
   auto-slotting pass. The simpler alternative: keep the binding in compiled
   files so slots are injected for you.

5. **Re-author shipped components in `.tsrx`.** `props.children` works, refs are
   props, lists use `@for (const x of xs; key x.id) { }`, conditionals use
   `@if`, dynamic text holes use `{expr as string}` unless the expression is
   provably a string.

6. **Validate.** Drive real DOM events against the bridged binding and, where
   possible, run the same fixture against the React original and compare
   rendered HTML after each step. Also test what HTML comparison cannot see:
   render counts, subscription add/remove, effect ordering, ref lifecycle.

## Verdict guide for the scan tool

- `bridgeable`: only same-name hooks used; a mechanical rename of imports to
  `octane` plus a `.tsrx` re-author of components is enough.
- `bridgeable-with-rewrites`: needs the `forwardRef` / `useDebugValue` / `lazy` /
  event rewrites above, but no architectural blockers.
- `needs-rework`: class components, `renderToPipeableStream`, `findDOMNode`, or
  React internals. Bridge the core, redesign the binding.
