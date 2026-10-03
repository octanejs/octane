---
'octane': patch
---

Compare a memo component's plain props with fewer ownership checks. The memo bail looked up own-property membership for every prop, so that an inherited `Object.prototype` value cannot stand in for a removed prop. That lookup is now made only for values such a read can produce: `undefined`, functions and objects. A primitive prop that compares equal is already the object's own. Rows that pass mostly strings and numbers bail with one lookup instead of one per prop. An own `__proto__` prop holding `Object.prototype` still counts as a change when it is replaced.
