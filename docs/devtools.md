# DevTools

`@octanejs/devtools` is a [TanStack Devtools](https://tanstack.com/devtools) plugin
that streams live Octane runtime diagnostics — the mounted component tree and
per-node hook/context state — into the shared devtools panel.

## Setup

Enable the runtime hook in your Vite config:

```ts
octane({ devtools: true });
```

This turns on profiling automatically in dev and is compiled out entirely in
production builds — there is no separate profiling flag to remember to flip off.

Then add the plugin to the TanStack Devtools host (`@octanejs/tanstack-devtools`):

```tsx
import { TanStackDevtools } from '@octanejs/tanstack-devtools';
import { octaneDevtools } from '@octanejs/devtools';

function App() @{
  <>
    <TanStackDevtools plugins={[octaneDevtools()]} />
    <MyApp />
  </>
}
```

`octaneDevtools()` starts the app-side bridge on first render. The bridge is a
no-op unless the app was built with `devtools: true`, so it's safe to leave the
plugin registered and gate only `TanStackDevtools` behind `import.meta.env.DEV`
or `lazy()`.

## The Components tab

The Components tab shows the live component tree — every mounted root and its
descendants, updating as the app renders. Selecting a node in the tree asks the
app to describe it and shows:

- **Hook cells** — each hook slot's kind (`state`, `reducer`, `ref`,
  `memo-or-callback`) and current value.
- **Context** — the context values the node reads, by name.
- **Effect count** — the number of effects registered on the node.

## Guarantees

- **Read-only.** Selecting a node only requests a description from the app; the
  v1 plugin never mutates app state.
- **Dev-only.** The bridge reads a `globalThis.__OCTANE_DEVTOOLS__` hook that
  only exists in profile/devtools builds. Without `devtools: true`, `startBridge`
  finds no hook and does nothing.
- **Zero production cost.** The runtime hook lives behind the profile compile
  flag, so a production build tree-shakes it away entirely — there's no residual
  hook, listener, or branch left in shipped code.

## Known caveat

The state inspector infers each hook's kind structurally from its runtime shape,
not from the source call that created it. `useMemo` and `useCallback` produce the
same shape at runtime, so both show up as a single `memo-or-callback` kind —
Octane has no way to tell them apart once mounted.

## Coming next

P1 ships the Components tab described above. Planned follow-ups (P2–P4): a
Profiler tab, a Transitions & Suspense tab, and a Performance-model tab.
