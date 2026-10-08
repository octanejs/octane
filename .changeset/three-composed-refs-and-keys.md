---
'@octanejs/three': patch
---

Type-check composed refs and keyed rows in Three `.tsrx` files. A ref array may
now hold `null` or `undefined` entries, which Octane leaves when it composes an
authored ref with a spread that carries none, and which attachment already
skipped. The intrinsic JSX namespace now declares `IntrinsicAttributes`, so a
component can take the `key` that a keyed `@for` row places on its root.
