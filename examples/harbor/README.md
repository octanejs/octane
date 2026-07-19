# Harbor

A server-rendered **React 19** pricing page that hosts three compiled Octane
islands through `<OctaneCompat>` (`octane/react`) — the repo's first
React-hosted example, and the browser E2E regression fixture for the
React↔Octane boundary that the compat plan calls for before public release.
It is living proof of the homepage's "Incrementally migrate. With
OctaneCompat." claim: React owns the shell (providers, header state, error
boundary, streaming SSR server); Octane owns three islands.

## What it proves

| Journey | Boundary behavior |
| --- | --- |
| `pre-hydration-input-preservation` | Streaming SSR delivers the full page; input typed into the server DOM **before** `hydrateRoot` survives adoption on the **same node**, and a mount-time layout effect folds the pre-hydration edit into island state |
| `island-react-round-trip` | Native island events (steppers, per-keystroke `onInput`) drive island state; a stable callback prop hands results back to React, which renders the compare badge and summary — no island remount across React re-renders |
| `provider-flip-context` | Islands read the shell's **real React contexts** with plain `use()`; locale and theme provider flips re-render the island and a React label off the same context, live |
| `island-fault-boundary-retry` | A client-side island rejection (`@try`/`@pending`, deliberately no `@catch`) escapes into the React **class error boundary**; the sibling island keeps working; "Try again" key-bumps a clean island; the consumed fault gives way to the island-owned pending arm and refreshed data |

Every journey runs with the diagnostics gate ON: page errors, console errors,
and hydration-mismatch warnings all fail the suite.

A client-only fresh-mount journey is deliberately out of scope for v1 — that
path is unit-pinned by `packages/octane/tests/react-hosted/opaque-hydration`
and exercised by `benchmarks/react-hosted-islands`.

## Architecture

- `server.mjs` — Node http + Vite middleware mode. Each request transforms
  `index.html`, splits it on `<!--ssr-outlet-->` inside `#root`, and pipes
  React's `renderToPipeableStream` between the prefix and suffix. Island
  **server** faults surface in Fizz `onError`, never in React boundaries.
- `src/App.tsx` — the shell. The Compat component arrives **as a prop**:
  `entry-server.tsx` passes it from `octane/react/server`, `entry-client.tsx`
  from `octane/react`; trees and island props are otherwise identical. Islands
  mount through both OctaneCompat authoring forms — the element-child form and
  the `component`/`props` transport form — and every island prop is checked
  against the island's own octane-typed `.tsrx` signature (`pnpm typecheck`
  runs `tsrx-tsc`; `src/island-boundary.test-d.tsx` pins the boundary with
  `@ts-expect-error` cases).
- `src/islands/*.tsrx` — open with `'use octane'`; the Vite config's
  `requireDirective` split gives Octane exactly these modules and
  `@vitejs/plugin-react` everything else.
- `src/data/resources.ts` — deterministic seeded thenables (synchronous
  `use()` reads on both server and hydrating client) plus a fail-once refresh
  outage (`?fault=recs`) and a fixed-delay refresh. No network, ever.
- `?hydrateDelay=<ms>` (capped 2s) delays `hydrateRoot` so pre-hydration
  interaction is observable and deterministic.

## Run it

```bash
pnpm --filter harbor-example dev        # dev server (PORT=5178 by default)
pnpm --filter harbor-example typecheck
pnpm --filter harbor-example build      # production client build
pnpm --filter harbor-example test:e2e   # boots its own server on an OS port
```

## Follow-ups

- Client-only fresh-mount journey (see above).
- The Vite config aligns Vite 8's oxc `jsx.refresh` with plugin-react's
  preamble gating under `NODE_ENV=production` serve sessions; drop
  `harbor:align-oxc-refresh` once plugin-react keys both on the same flag.
