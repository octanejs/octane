---
'@octanejs/drei': patch
---

`TransformControls` and the pivot controls cast `state.controls` through
`unknown`, as upstream drei does. `tsrx-tsc` from `@tsrx/typescript-plugin`
0.4.10 reports the direct cast from `EventDispatcher | null` as TS2352.
