---
'octane': patch
---

Fixes two ways a loop head could hide a component reference from free-variable
analysis, each of which let the capture-free hook-callback lift move a callback
that was not actually capture-free:

- A `for-in`/`for-of` head with no declaration ASSIGNS an existing binding
  rather than introducing one. It was being treated as a fresh loop binding, so
  `for (acc of s.items) { … }` hid the write to the component's `acc` entirely
  and the callback read as capture-free. Lifted to module scope, that
  assignment has no binding to land on.
- A destructuring default in a loop's declaration —
  `for (const [x = props.seed] of s.pairs)` — is an expression that runs on
  every iteration, but only the names the pattern declared were collected, so
  the read of `props` was invisible.

Both are corrected in the shared analysis, so every caller of it benefits, and
the same treatment is applied to the `@for` template directive's head.
