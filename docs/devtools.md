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

## Four tabs

The panel is a small tab bar — **Components**, **Profiler**, **Transitions
& Suspense**, and **Performance** — with one tab visible at a time. All four
read from the same `octaneDevtools()` bridge; switching tabs doesn't reset
any of their subscriptions.

## The Components tab

The Components tab shows the live component tree — every mounted root and its
descendants, updating as the app renders. Selecting a node in the tree asks the
app to describe it and shows:

- **Hook cells** — each hook slot's kind (`state`, `reducer`, `ref`,
  `memo-or-callback`) and current value.
- **Context** — the context values the node reads, by name.
- **Effect count** — the number of effects registered on the node.
- **Native reads** — when `nativeReads: true` is enabled, the selected scope's
  accepted reads, pending attempts, and suspended retry sources. Each read shows
  its data scope/key, read mode, observed and current revisions, dependency keys,
  retirement and historical-lease state. Async sources also report retained
  values, refresh activity, stream connection state, and completion. These are
  cached metadata: inspection never evaluates a derived computation, starts a
  request, serializes a native value, or subscribes to a new source. Revisions
  describe invalidation; they are not request attempt identifiers.

Native read detail identifies the actual scheduled renderer owner separately
from the selected scope, since a lightweight component can share its parent's
Block. The bridge refreshes only the selected node after a flush and clears its
detail when it leaves the tree. Hook-value previews show accessors as `[Getter]`
without invoking them. Protocol version 3 adds the optional `nativeReads` detail
and an `inspect-clear` event; runtimes without native inspection omit the detail.

## The Profiler tab

The Profiler tab reads the same profiling data the runtime already collects
internally (`octane/profiling`, tree-shaken out of non-devtools/profile
builds) and renders it as two views:

- **Slowest components (self time)** — a table of every profiled component,
  ranked by total self time, with columns for **Component**, **Renders**
  (attempt count), **Self ms**, **Max ms** (the slowest single render's
  inclusive time), **Queue ms** (average scheduling delay before the render
  ran), and **Cause** (the component's most frequent re-render trigger, or `-`
  when none was recorded).
- **Recent commits** — a chronological list of the latest render events, each
  showing the component name, phase (`mount` or `update`), self time in
  milliseconds, and its causes (or the render's outcome when no cause was
  recorded).

Until the app has rendered anything with profiling enabled, the tab shows
"No profiling data yet — interact with the app." instead of empty tables.

## The Transitions & Suspense tab

The Transitions & Suspense tab shows the live pending-transition count — how
many transitions are in flight right now — and, below it, every mounted
Suspense boundary's current state:

- **init** — the boundary has never suspended.
- **pending** — a descendant is currently suspended and the fallback may be
  showing.
- **resolved** — the boundary's primary content is showing.
- **caught** — the boundary is displaying a thrown error.

A boundary that has resolved at least once also carries a **"(resolved
once)"** marker alongside its current state, so a boundary that's back in
`pending` (e.g. re-suspended by a later transition) still shows it has
successfully resolved before. Before any transition has fired, the tab shows
"Pending transitions: 0" and "No Suspense boundaries."

This tab reads two new dev-only runtime probes — one on the scheduler's
transition-pending counter, the other on each Suspense boundary's `TrySlot`
state transitions — both gated behind the same profile compile flag as the
rest of the devtools hook, and stripped from production builds like
everything else here.

Known v1 limitation: on a boundary's very first reveal, the "(resolved
once)" marker can lag by one transition; this is a display-only artifact of
when the marker is recomputed and does not affect the runtime.

## The Performance-model tab

The Performance-model tab is an **aggregate** "what's slow" view over the
exact same `profile` event the Profiler tab already consumes — it derives its
lists from that snapshot, not from any new data source, event, or runtime
probe. Where the Profiler tab is a per-commit table, this tab ranks:

- **Slowest mounts (self time)** — the five slowest `mount`-phase render
  events by self time, each showing the component name and its self time in
  milliseconds.
- **Queue-delay hotspots** — the five components with the highest average
  scheduling delay (`averageQueueDelay`), excluding any component already
  shown in the slowest-mounts list above, so the two lists highlight distinct
  signals (heavy initial renders vs. scheduling delay) instead of repeating
  the same component twice.
- **Recent commit self-time** — a small bar trend of every recent render
  event's self time, in event order, for an at-a-glance sense of whether
  commits are trending slower.

Until the app has rendered anything with profiling enabled, the tab shows
"No performance data yet — interact with the app." instead of empty lists.

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

## Live demo

The website has a `/devtools` route (dev only) that mounts an interactive
Octane app — state, a reducer, a `useTransition` filter, two Suspense
boundaries, and an intentionally slow component — alongside the panel, so all
four tabs light up. Run `pnpm --dir website dev` and open `/devtools`.

The website enables devtools through its TanStack Start plugin option
instead of the plain `octane({ devtools: true })` shown above —
`tanstackStart({ octane: { devtools: true } })` — since the website is a
`@octanejs/tanstack-start` app; a plain Vite-plugin app still uses
`octane({ devtools: true })`.

## Coming next

P1 shipped the Components tab, P2 shipped the Profiler tab, P3 shipped the
Transitions & Suspense tab, and P4 shipped the Performance-model tab plus the
`/devtools` live demo route above (all described here). The DevTools feature
is complete for this milestone.
