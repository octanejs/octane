---
'octane': patch
---

In development, a hook that runs while no component is rendering now throws an error that says so, instead of `TypeError: Cannot read properties of null (reading 'hooks')`. Compiled components always pass their hook slots, so this mostly happens when an app bundles two copies of Octane, even of the same version, and a component's hooks come from the copy that is not rendering. The error asks you to check that the renderer, the hooks, and `octane/internal/client` all resolve to one installed `octane` package. A hook called with no slot still reports the missing slot first. Production builds are unchanged.
