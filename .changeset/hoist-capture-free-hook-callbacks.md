---
'octane': patch
---

Production compiles lift a capture-free function argument of a hook call to
module scope, so the hook sees one identity for the module's lifetime instead of
a fresh function every render.

This matters for hooks that COMPARE the callback. A store selector is the
motivating case: `useSelector(store, (s) => s.total)` feeds a memo keyed on the
selector's identity, and an inline arrow defeats it on every render — so an
unrelated parent re-render re-runs the selection for every subscriber. Measured
on 512 subscribers over 20 unrelated re-renders, selector invocations drop from
512 per render to zero. Holding the compile mode fixed and varying only selector
identity, an expensive selector's re-render cost fell about 25% (62.6–64.1ms →
46.5–47.4ms across three runs); with a cheap selector the wall-clock difference
stayed inside run-to-run noise, so the durable claim is the eliminated work
rather than a fixed speedup.

The analysis is deliberately conservative and over-approximates the component's
bindings, so shadowing can only cost a lift, never produce a wrong one. A
callback is left exactly where it was authored when it reads component state,
`this`, or `arguments`, renders JSX, or contains a hook call.

Hooks whose contract is stated in terms of the callback are excluded, because
moving it would change observable behavior rather than just an address:
`useCallback` returns the argument and owes a fresh identity when deps change;
`useMemo` and the effect hooks are defined by how often the callback runs;
`useState`/`useReducer` take a once-only lazy initialiser; `useEffectEvent`
deliberately hands back an unstable wrapper. Custom `use[A-Z]` hooks and
`useSyncExternalStore` — whose `subscribe`/`getSnapshot` are data it reads —
take the lift.

Dev, HMR, and profile compiles keep the authored form, on the same gate as the
neighbouring inline hook-memo tier.

Two free-variable analysis fixes come with it, both affecting capture analysis
generally rather than only the lift:

- A binding pattern's default initialisers and computed keys are expressions
  evaluated at binding time, and were never walked — only the names a pattern
  declared were collected. So `(s, scale = props.factor) => …` and
  `({ [props.field]: picked }) => …` reported no reference to `props` at all,
  and read as capture-free.
- A classic `for (let i = 0; …)` carries its declaration in the loop's `init`
  rather than its `left`, so `i` was reported free and read as a capture of an
  enclosing binding the loop actually shadows. This made any callback containing
  a counting loop look instance-specific.
