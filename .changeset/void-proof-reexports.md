---
'octane': patch
'@octanejs/rspack-plugin': patch
---

Follow exact `export { a as b } from '...'` re-exports when proving imported void components in production Vite and Rspack builds, so a component imported through a plain `.ts` index (such as a package entry over `.tsrx` files) compiles to the same specialized call as a direct import and no longer retains the generic host-element renderer.
