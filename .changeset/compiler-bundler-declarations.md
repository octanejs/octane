---
'octane': patch
---

`octane/compiler/bundler` and `octane/compiler/renderers` now ship TypeScript declarations, so a strict TypeScript build pipeline can import `createOctaneCompiler` and its options, compiler instance, and transform result without TS7016. The renderer configuration types (`OctaneRendererConfigOptions` and friends) are still exported from `octane/compiler/vite`.
