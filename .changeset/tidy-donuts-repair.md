---
'octane': patch
---

`octane/compiler` is now safe to import from browser dev servers again: the Node-only tooling siblings the entry re-exports (`vite.js`, `bundler.js`) switched their `node:fs`/`node:path`/`node:crypto`/`node:module` imports from named to namespace form, so evaluating them against a bundler's externalized `node:*` shim no longer throws at module load. The pure `compile` entry (used by the website playground to compile in-page) works in dev-served module graphs, not just tree-shaken production bundles. No behavior change in Node.
