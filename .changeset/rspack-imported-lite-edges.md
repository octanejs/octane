---
"@octanejs/rspack-plugin": patch
---

Render hookless imported components on the lightweight component path in Rspack production builds, as Vite production builds already do. Each importer is rebuilt with the lite proofs its imported modules published, one module of an import chain per round, and a module that a loader other than SWC transforms after Octane publishes none. Rendering, hydration and update behavior are unchanged.
