---
"octane": patch
---

Add React-shaped hydration mismatch detection + recovery, with `suppressHydrationWarning`
and dev-only source-location attribution. Previously `hydrateRoot` adopted the server DOM
blindly, so any server/client divergence silently produced broken DOM (and a list-grow
mismatch could crash). Now:

- **Value mismatch (text / attribute):** the adopted node is patched to the client value
  (`htext`/`htextSwap`/`childTextHole`/`setAttribute`).
- **`suppressHydrationWarning`:** React shallow semantics — keeps the server value and
  suppresses the warning for that element. It is never serialized to the server HTML.
- **Structural mismatch:** a swapped `@if`/`@switch` branch (including same-tag branches
  that differ only by a static attribute), a changed tag, a host↔component swap, or an
  over-long `@for` is detected and the affected subtree is rebuilt on the client (the stale
  server nodes are discarded and the hydration cursor stays aligned, so following siblings
  still adopt correctly).
- **Dev DX:** mismatch warnings include a Svelte-5-style source location
  (`App.tsrx:42:5`), surfaced via a new dev-only `dev` compiler option.

Recovery runs in development and production; the warnings and source-location metadata are
development-only and strictly gated, so production output is byte-identical (zero cost).
