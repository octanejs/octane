---
'octane': patch
---

A plain `.ts` or `.js` module that calls a hook-named method while it initializes, such as `export const initial = store.useValue()`, now evaluates instead of throwing `ReferenceError: Cannot access '_h$0' before initialization`. That covers top-level statements, optional chains, and a module-level class's static fields, static blocks, and computed keys. These calls run outside every render, so they keep their authored form with no hook slot. A hook call in an instance field initializer runs with each construction, possibly during a render, so a hook method or module-declared custom hook called there now keeps its own slot, as it would in a constructor.
