# Skill: Bridge a React package to Octane

Use this when a user wants a React ecosystem library to work in their Octane app.

## Check for an official binding first

These libraries already have maintained Octane ports. Install the binding instead
of bridging by hand:

| React package | Octane binding |
| --- | --- |
| `zustand` | `@octanejs/zustand` |
| `jotai` | `@octanejs/jotai` |
| `@apollo/client` | `@octanejs/apollo-client` |
| `@tanstack/ai-react` | `@octanejs/tanstack-ai` |
| `@tanstack/react-form` | `@octanejs/tanstack-form` |
| `@tanstack/react-query` | `@octanejs/tanstack-query` |
| `@tanstack/react-router` | `@octanejs/tanstack-router` |
| `@tanstack/react-store` | `@octanejs/tanstack-store` |
| `@tanstack/react-table` | `@octanejs/tanstack-table` |
| `@tanstack/react-virtual` | `@octanejs/tanstack-virtual` |
| `framer-motion` / `motion` | `@octanejs/motion` |
| `@stylexjs/stylex` | `@octanejs/stylex` |
| `styled-components` | `@octanejs/styled-components` |
| `react-router` / `react-router-dom` | `@octanejs/remix-router` |
| `@lexical/react` | `@octanejs/lexical` |
| `lucide-react` | `@octanejs/lucide` |
| `@floating-ui/react` | `@octanejs/floating-ui` |
| `radix-ui` | `@octanejs/radix` |
| `react-i18next` | `@octanejs/i18next` |
| `react-hook-form` | `@octanejs/hook-form` |
| `@base-ui-components/react` | `@octanejs/base-ui` |
| `@dnd-kit/react` | `@octanejs/dnd-kit` |
| `sonner` | `@octanejs/sonner` |
| `streamdown` | `@octanejs/streamdown` |
| `@streamdown/code` | `@octanejs/streamdown/code` |
| `@streamdown/math` | `@octanejs/streamdown/math` |
| `@streamdown/mermaid` | `@octanejs/streamdown/mermaid` |
| `@streamdown/cjk` | `@octanejs/streamdown/cjk` |
| `recharts` | `@octanejs/recharts` |
| `@react-three/fiber` | `@octanejs/three` |
| `@visx/*` | `@octanejs/visx` |
| `react-redux` | `@octanejs/redux` |
| `@reduxjs/toolkit` | `@octanejs/redux-toolkit` |
| `@testing-library/react` | `@octanejs/testing-library` |
| `@mdx-js/react` | `@octanejs/mdx` |

The `octane_bindings` tool returns the same map machine-readably. For anything
else, run the `octane_bridge_react_package` tool to get a scan of the
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

2. **Bridge from the pinned upstream source, not from memory.** Fix the exact
   upstream version you are bridging and copy that release's React binding source
   into your repository next to your port, for example
   `src/vendor/<package>@<version>/`, keeping the upstream LICENSE and leaving
   the copy unmodified. Put each Octane module beside the upstream module it
   replaces, and work through them one by one. A bridge written from the README
   or from type declarations covers the demo path and silently drops the rest of
   the API. Anything you cannot reach (React internals, class components,
   synthetic-event timing) goes in a short divergence note next to the port, with
   what to do instead. On an upgrade, re-copy at the new version: the diff
   against the old copy is your work list.

3. **Map the React APIs.** Same-name and same-semantics in Octane: `useState`,
   `useReducer`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`,
   `useCallback`, `useRef`, `useContext`, `useId`, `useImperativeHandle`,
   `useSyncExternalStore` (full React 19 shape, including `getServerSnapshot`),
   `useTransition`, `useDeferredValue`, `useActionState`, `useOptimistic`,
   `useEffectEvent`, `useDebugValue` (accepted no-op), `use`, `startTransition`,
   `memo`, `lazy` (also accepts a bare component from the loader),
   `createContext`, `Suspense`, `createPortal`, `flushSync`, `createRoot`,
   `hydrateRoot`. Everything imports from `octane` (no separate `react-dom`);
   server rendering imports from `octane/server`, including the streaming
   `renderToPipeableStream`/`renderToReadableStream`.

4. **Handle the gaps:**
   - `forwardRef`: does not exist. Accept `ref` as a normal prop (React 19
     style) and drop the wrapper.
   - Class components: rewrite as function components. Error boundary classes
     become `<ErrorBoundary>` or the `@try { } @catch (e) { }` directive.
   - Synthetic `onChange` on standard text hosts: use native `onInput` when the
     callback means every edit. Octane events are native and delegated.
     Controlled `value`/`checked` follow React's semantics (the prop drives the
     DOM property and reasserts on commits), so per-edit controlled-input logic
     ports unchanged apart from the event name. Do not blanket-rewrite public
     callbacks, selects, or checkbox/radio handlers. A deliberate uncontrolled
     text commit may keep `onChange` with `suppressNativeChangeWarning`.
   - StrictMode double-invoke: does not exist; delete test expectations that
     count double renders.

5. **Custom hooks in plain `.ts` files.** Octane's compiler auto-slots hook
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

6. **Re-author shipped components in `.tsrx`.** `props.children` works, refs are
   props, lists use `@for (const x of xs; key x.id) { }`, conditionals use
   `@if`, dynamic text holes use `{expr as string}` unless the expression is
   provably a string.

7. **Run the package's own tests.** If the pinned release ships a suite, that is
   the parity oracle: it encodes what its maintainers care about, and it covers
   cases a suite written against your own bridge will not think to check. Run the
   framework-neutral suites unmodified against the core you reused. Port the
   React-binding ones case by case: fixtures re-authored in `.tsrx`,
   `@octanejs/testing-library` in place of `@testing-library/react`, upstream case
   names kept. Write down which upstream test files you ran, ported, or left out
   and why. Do not soften an upstream assertion to get it green; find out whether
   it is a bridge bug or a documented Octane divergence first.

8. **Validate the rest.** Drive real DOM events against the bridged binding and,
   where possible, run the same fixture against the React original and compare
   rendered HTML after each step. Also test what HTML comparison cannot see:
   render counts, subscription add/remove, effect ordering, ref lifecycle.

## Verdict guide for the scan tool

- `bridgeable`: only same-name hooks used; a mechanical rename of imports to
  `octane` plus a `.tsrx` re-author of components is enough.
- `bridgeable-with-rewrites`: needs the `forwardRef` / event / `react-dom/server`
  import rewrites above, but no architectural blockers.
- `needs-rework`: class components, `findDOMNode`, or React internals. Bridge
  the core, redesign the binding.
