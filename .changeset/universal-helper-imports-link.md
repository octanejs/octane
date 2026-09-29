---
'octane': patch
---

Import only the renderer helpers a universal module's output references.

Universal compiler output used to import every region helper from its renderer
module, whether or not it called them. A standalone renderer runtime exports only
the helpers it implements, so bundlers such as esbuild rejected the unused
imports. The Lynx main thread hit this after `universalBlock` was added: even a
plain `<view />` component failed to link.

`octane/universal` and `octane/universal/native` now also export `useFormState`,
the pre-19 name for `useActionState`. The universal compiler already accepted
that import from `octane`, but no universal runtime provided it.
