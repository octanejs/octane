---
'octane': patch
---

Direct calls to hot-reloadable exports now behave the same in development as in production. Calling an exported return-JSX function directly with a second argument, as in `renderRow(item, index)`, no longer makes the next hot update throw `TypeError: Cannot read properties of undefined (reading 'disposed')`, and a `null` second argument no longer throws at the call. Direct calls also receive their `this` and every argument unchanged, where development previously passed exactly three arguments, dropping extras and padding missing ones with `undefined`.
