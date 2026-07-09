---
'octane': patch
---

Compiler: the binding bag is now allocated in ONE shot by shared runtime arity factories (`bag0`…`bag16`, spill `bagOf`) with its real mount values — `_b = _$bag5(__s, _root, v0, …)` builds `{a: v0, b: v1, …}` (final hidden class + real field representations at allocation, one hot allocation site per arity), inserts the root, and commits `__s.slots[0]`, replacing the per-field property-write mount and the inline insert/commit pair. Bag fields are compiler-assigned 1-char names (minifiers can't shorten object properties — this is a shipped-bytes win: −17.6% minified / −5.5% gzip on the codegen-size corpus), except ref/spread/fragmentRef fields, which keep their long names for the runtime's suspense-hide ref walk and route through `bagOf`.
