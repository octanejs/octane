---
'octane': patch
---

Compiler-inferred component memoization now admits spread bags on host
elements. `<path d={e.d} {...e.attrs}>` inside a component body no longer
disqualifies that component's region cache or its keyed-list caches: a host
spread is one runtime-diffed binding whose bag is reachable only from
dependencies the region guard already witnesses, so skipping on unchanged
dependencies is exactly the no-op a re-entry would have been. Re-entries keep
full spread semantics — changed keys apply, vanished keys clear, and
spread-supplied refs and event handlers attach, swap, and detach as before.
Spreads on component tags keep failing closed: they build the child's props
snapshot, which cached call sites must never construct from a getter-bearing
bag.
