---
"@octanejs/stylex": patch
---

Fix `@octanejs/stylex/vite` failing to load in a consuming app's `vite.config.ts`. The Vite plugin and its transform were authored in TypeScript with an extensionless relative import; vite externalizes the workspace plugin and loads it through Node's ESM loader (not vite/esbuild), which can't resolve an extensionless `.ts` source import — so any octane app wiring `stylex()` into its vite config errored with `ERR_MODULE_NOT_FOUND` before the config even loaded. The plugin tooling is now authored in plain `.js` (`vite.js` + `transform.js`) with explicit `.js` import extensions, matching octane's own `compiler/vite.js`: build tooling Node executes directly can't be raw `.ts` source.
