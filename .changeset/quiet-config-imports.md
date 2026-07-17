---
'@octanejs/app-core': patch
---

Suppress the spurious Vite "dynamic import cannot be analyzed" warning emitted when the config loader imports the evaluated `octane.config` module from the cache directory. The import target is a runtime-emitted file that Vite can never analyze statically, so it is annotated with `/* @vite-ignore */`.
