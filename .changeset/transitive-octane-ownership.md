---
'octane': minor
---

Recognize an `octane.source` manifest marker on linked and workspace packages. A package outside `node_modules` that receives Octane transitively from a shared toolkit can now declare `"octane": { "source": true }` instead of re-adding an `octane` version range it does not own, purely as a compiler marker. Installed packages under `node_modules` still require a declared `octane` dependency, and ownership stays explicit per package.
