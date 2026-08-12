---
'@octanejs/jotai': patch
'@octanejs/redux': patch
'@octanejs/remix-router': patch
---

Fix published source that a browser application cannot type-check.

These packages ship raw source and point their exports at it, so a consumer's
TypeScript program compiles every reachable module.

Every `process.env.NODE_ENV` reference in published source now carries a
module-local `declare const process`. A browser application has no
`@types/node`, so the bare global was an error there. The expression is left
written out literally so a bundler's `define` substitution, and the dead-code
elimination that follows it, keep working exactly as before; nothing ambient
ships in the tarball.

`Form` and `Link` in `@octanejs/remix-router` accepted a forwarded `ref` typed
as possibly `undefined`. The compiler composes a forwarded ref with the host
spread's ref as `ref={[ref, spread.ref]}`, and members of a `Ref<T>` array
cannot be `undefined`. They now accept `null`, which `attachRef` already treats
as absent.
