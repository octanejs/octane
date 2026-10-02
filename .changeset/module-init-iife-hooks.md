---
'octane': patch
---

A plain `.ts` or `.js` module that calls a hook-named method or a custom hook inside a function it invokes in place, such as `export const value = (() => store.useValue())()`, now evaluates instead of throwing `ReferenceError: Cannot access '_h$0' before initialization`. That covers arrow and function expressions called directly or through `.call` and `.apply`, including async ones. A generator body waits for `.next()`, which a render may call, so its hook calls still get their own slot, as do those in a function invoked in place inside a component or hook.
