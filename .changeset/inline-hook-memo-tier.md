---
'octane': patch
---

De-callback the hook memo tier in production client compiles, and memoize
use()-fed promise chains at their declarations.

- Authored and auto-generated `useMemo`/`useCallback` declarations compile to
  inline flat-cache regions: zero allocations on a dependency hit (no factory
  closure, no deps array, no hooks-map lookup), `Object.is` dependency
  semantics, closures allocated only on a miss. Dev/HMR/profile, server,
  universal units, and ineligible shapes keep the runtime form.
- Parallel-`use()` creations lower to a closure-free `puTake`/`puPub` runtime
  ABI that preserves every warm-plan semantic (adoption, episode stamping,
  dedup) while eliminating the per-render arrow + deps-array allocations.
- New Pass A′ (client and SSR): local `const` promise chains that feed `use()`
  (`const p = fetchUser(id); const t = p.then(…); use(t)`) are now memoized at
  their declarations — no duplicate fetch per suspend-replay, no refetch on
  unrelated re-renders, derived links key on their upstream promise's
  identity, and the chain head joins the `__warm` prefetch plan.
