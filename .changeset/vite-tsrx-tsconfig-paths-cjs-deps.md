---
'octane': patch
---

Fix two `octane/compiler/vite` gaps that broke installed Octane packages and `.tsrx` path aliases.

- `resolve.tsconfigPaths` now resolves from `.tsrx` files. Vite applies a tsconfig only to files its `include` matches, using TypeScript's own extensions, so `"include": ["src"]` never matched `src/App.tsrx` and every `~/…` import from it failed in dev and build. A `.tsrx` file now gets the `paths` of the tsconfig that owns it under Octane's TypeScript, where `.tsrx` is a source extension. A `.tsrx` file outside every `include` still gets none, like a `.ts` file there.
- In dev, the CommonJS beneath an installed Octane source package is now prebundled. Those packages are excluded from Vite's dependency optimizer, so Vite served their imports raw from `node_modules`, and a CommonJS module below them failed in the browser with "does not provide an export named 'default'" (`@octanejs/markdown` through `style-to-js`, `@octanejs/pierre-diffs` through `lru_map`). When a dependency of such a package reaches CommonJS, the plugin now discovers every import the browser requests from the package, as Vite does for a linked package. Apps no longer need hand-written `source-package > dependency` entries in `optimizeDeps.include`. A package whose dependencies are ESM throughout stays raw, and `optimizeDeps.exclude` still applies.
