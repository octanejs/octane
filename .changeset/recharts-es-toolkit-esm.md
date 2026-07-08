---
'@octanejs/recharts': patch
---

es-toolkit compat imports normalized to the ESM barrel (`import { get } from 'es-toolkit/compat'`). The per-function subpaths upstream recharts uses (`es-toolkit/compat/get`, `/range`, `/sortBy`) are CJS-only stubs with no `import` condition — fine for recharts' own prebuilt dist, but this binding ships raw TS source, and vite's dev prebundle produced a broken CJS-interop chunk (`require_toKey is not a function`) that killed client hydration for any app rendering charts in dev. Same named exports, same semantics; production builds were unaffected.
