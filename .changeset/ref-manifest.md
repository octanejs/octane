---
'octane': patch
---

Compiled output: ref manifest. Bodies with ref-carrying bindings (`ref={…}`, spreads, `<Fragment ref>`) now stamp a module-scope manifest (`__s.refFields` — flat kind/field/element triads) that the suspense-hide path walks directly, replacing the key-prefix scan over the binding bag. Those fields therefore take normal 1-char names and ride the positional bag arity factories — previously one ref anywhere in a component forced the whole bag onto the named-literal spill. Detach/re-attach timing across a suspend is unchanged.
