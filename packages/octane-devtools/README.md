# @octanejs/devtools

Live Octane runtime diagnostics for the [TanStack Devtools](https://tanstack.com/devtools)
panel — a Components tab showing the mounted component tree and per-node state,
streamed over `@tanstack/devtools-event-client` from a dev-only runtime hook.

> Status: scaffolding only. The plugin implementation lands in a follow-up change.

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

Only include the devtools in development, e.g. behind an `import.meta.env.DEV`
check or via `lazy()`.
