---
'octane': patch
---

Build files outside the Vite or Rspack root to the same bytes from any checkout location. Their compiler module ID is now relative to the root (`../packages/ui/src/Card.tsrx`) instead of the absolute host path. Every component and signal site hash in those files includes that ID, so moving a monorepo, or building in a different CI directory, produced different bundles from identical source. Workspace packages linked from outside the application root, such as Octane bindings in a monorepo, were affected.
