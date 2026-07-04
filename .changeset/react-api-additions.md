---
'octane': patch
---

Add three React parity APIs, closing the "missing API" gaps short of streaming SSR:

- `lazy(load)` — code-splitting. Suspends into the nearest `@try`/`<Suspense>` until the module promise settles, then tail-calls the loaded component (hooks, context, and props flow as if statically imported); a rejected load routes to `@catch`. Works on the server too: `renderToString` emits the pending fallback, `prerender` awaits the module. Accepts `{ default: Component }` or a bare component function.
- `requestFormReset(form)` — React DOM parity. Inside a transition/action the reset is deferred until the action window settles (the manual companion to the automatic reset of plain `<form action={fn}>`); outside one it warns and resets immediately.
- `useDebugValue()` — no-op (octane has no devtools inspector), so custom hooks ported from React run unchanged.

All three are exported from `octane` and mirrored in `octane/server`. (`createRef` stays out: it exists for class components, which octane does not support.)
