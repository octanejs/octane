---
'octane': patch
---

Compiled output 3b: `() => fn(arg, …)` event handlers now compile to one arity-helper call per site — `_$evt1(el, "$$click", fn, arg)` builds the `{ fn, args }` descriptor once at mount and returns it as the binding's single bag field (previously element + fn + every arg were cached separately), and `_$evt1u(d, fn, arg)` mutates that descriptor in place on update. Dispatch reads the element's event slot per event, so the mutation is observed with no identity compare, no object rebuild, and no property re-assignment — deleting the largest repeated update block in the generated code.
