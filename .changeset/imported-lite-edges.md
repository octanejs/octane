---
'octane': patch
---

Render hookless imported components on the lightweight component path in Vite production builds, as same-module ones already are. An exported component whose body calls no hooks, returns no value and whose subtree reads no context now publishes that proof, and an importer calls it without allocating a Block. Mounts and changed-prop updates of imported component chains do less work; rendering, hydration and update behavior are unchanged.
