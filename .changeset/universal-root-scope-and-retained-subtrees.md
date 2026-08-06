---
'octane': patch
---

Universal target: the root component now carries a committed range, so a state
update in the root component itself replays through the scoped path instead of
falling back to a whole-root attempt (issue #574 follow-up). Replays also adopt
committed component subtrees whose props, state, contexts, and code revision
are provably unchanged instead of re-rendering and re-drafting them, and child
owner claims resolve through a positional fast path when the render keeps its
committed order. In the issue's repro shape with state at the root, one press
beside 4,000 untouched siblings drops from ~55 ms to ~10 ms, and clean-subtree
adoption also flattens the cost of large in-scope replays such as list
components re-rendering unchanged items.
