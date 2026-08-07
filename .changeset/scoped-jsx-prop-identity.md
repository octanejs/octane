---
'octane': patch
---

Stop rebuilding a component's children when an unrelated context updates.

A component's children resolve lazily, in the scope they render in, so the
compiler wraps each one in a thunk that builds its element and its props object
on demand. That thunk was rebuilt whenever a single global context epoch moved,
and the epoch moved on every provider value change anywhere in the tree. A
rebuild re-runs the thunk, so the props object came back new, and with it every
inline callback and object literal written at that call site, even though the
component that authored them never rendered again.

Anything keyed on those identities churned: `useEffect`, `useCallback`, and
`useMemo` dependency arrays compared unequal every time, and `memo()` on such a
child could not bail out. Where one of those effects wrote state that fed the
same provider, the cycle never converged. `@octanejs/radix` `Form` hit exactly
that: a `Form.Message` with a function `match` re-registered and unregistered its
matcher forever, one round per frame, for as long as the form stayed mounted.

The rebuild is now keyed on the contexts a record actually read while resolving.
Reads are collected during resolution and re-checked against their context's
version, so a record that reads no context is never rebuilt by a provider update
and keeps the props it was given. The resolving scope is still honoured for
records that do read context, which is what keeps one shared descriptor from
serving two providers, and a lazily read context value still refreshes on the
render after it changes.

Scope alone no longer forces a rebuild either. Host classification resolves a
child in the parent block before the child block renders it, so the two scopes
alternate every render; combined with the check above that alternation was
re-creating props on its own.
