# @octanejs/devtools

Live Octane runtime diagnostics for the [TanStack Devtools](https://tanstack.com/devtools)
panel — a Components tab showing the mounted component tree and per-node state,
streamed over `@tanstack/devtools-event-client` from a dev-only runtime hook.

## Installation

```bash
npm install @octanejs/devtools
pnpm add @octanejs/devtools
```

## Usage

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

Enable the runtime hook in dev with `octane({ devtools: true })` in your Vite
config — production builds tree-shake the hook away entirely.

The Components tab shows the live component tree, and on selecting a node: its
hook cells (state/reducer/ref/memo-or-callback), context values, and effect
count. It's read-only in v1 — selecting a node never mutates app state.

The Profiler tab ranks components by self time (renders, self/max/queue ms,
dominant cause) and lists recent commits (mount/update, self ms, causes).

The Transitions & Suspense tab shows the live pending-transition count and
each Suspense boundary's state (init/pending/resolved/caught), with a
"(resolved once)" marker once a boundary has shown its primary content.

The Performance-model tab is an aggregate "what's slow" view over the same
profiler data as the Profiler tab: slowest mounts by self time, queue-delay
hotspots, and a recent commit self-time trend.

Only include the devtools in development, e.g. behind an `import.meta.env.DEV`
check or via `lazy()`.

See [`docs/devtools.md`](../../docs/devtools.md) for the full setup guide,
guarantees, and known caveats.
