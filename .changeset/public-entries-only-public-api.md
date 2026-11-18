---
'octane': minor
'@octanejs/app-core': patch
'@octanejs/aria': patch
'@octanejs/base-ui': patch
'@octanejs/docusaurus': patch
'@octanejs/draggable': patch
'@octanejs/i18next': patch
'@octanejs/motion': patch
'@octanejs/radix': patch
'@octanejs/select': patch
'@octanejs/spring': patch
'@octanejs/styled-components': patch
'@octanejs/tanstack-router': patch
'@octanejs/tanstack-start': patch
'@octanejs/testing-library': patch
'@octanejs/three': patch
'@octanejs/tiptap': patch
---

`octane` and `octane/server` now export only public API. Compiler-emitted
helpers, binding infrastructure and test-only hooks (`template`, `bag*`,
`evt*`, `withSlot`, `hookSlots`, `injectStyle`, `drainPassiveEffects`, the
`ssr*` string builders, and every `__`-prefixed name) move to
`octane/internal/client` and `octane/internal/server`, and compiled output
imports them from there. Server builds retarget `octane/internal/client` to
`octane/internal/server`, as they already do for bare `octane`.
`FragmentInstance` stays public on `octane`.

Bindings that hand-import these helpers now read them from the internal
entries. Recompile any code that was compiled by an earlier Octane compiler,
because that output imports the helpers from `octane`.
