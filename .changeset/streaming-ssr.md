---
'octane': patch
---

Streaming SSR: `renderToPipeableStream` (Node streams) and `renderToReadableStream` (web streams) land in `octane/server` — React `react-dom/server` parity with out-of-order Suspense streaming.

- **Shell first**: one synchronous pass flushes immediately — scoped styles, hoisted head, the body with each still-pending `@try`/`<Suspense>` boundary rendering its fallback behind a `<template data-oct-b="N">` sentinel, the shell's `use()` seeds, and a ~600-byte inline swap runtime. `onShellReady` fires at flush.
- **Out-of-order completion**: as each boundary's data settles, the stream appends a hidden segment (`<div hidden data-oct-s="N">`) holding the real content plus that boundary's own `use()` seed JSON, followed by `$OCTRC("N")` — which swaps the content into the boundary's live range, stashes the seeds on `window.$OCTS`, and leaves a `<!--oct-seed:N-->` scoping comment. Nested boundaries stream parent-first; a rejected promise streams the `@catch` arm through the same path. `onAllReady` fires when the last boundary lands; `abort()`/`signal` mark still-pending boundaries errored (`$OCTRX`) so hydration client-renders them.
- **Hydration**: the client's `mountTry` recognizes the seed-scope comment and scopes that boundary's seeds to its subtree during adoption — a streamed page hydrates byte-for-byte with no re-suspend, no rebuild, and no mismatch warnings, verified end-to-end (stream → swap-runtime execution → `hydrateRoot`).
- Built on the same pass/cache engine as `prerender`: each settle round re-renders against the warmed cache and flushes newly-completed boundaries (plus any late scoped styles). The compiled `@try` emit now routes through a runtime `ssrTry` helper (byte-identical output for buffered renders), and the JSX `<Suspense>` builtin streams too.

Documented divergences from React Fizz: no selective hydration (octane has no synthetic event replay), per-round re-passes rather than per-boundary incremental renders, and head elements hoisted from inside a streamed boundary are re-created client-side on hydration rather than shipped mid-stream.
