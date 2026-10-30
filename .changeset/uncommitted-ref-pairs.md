---
'octane': patch
---

Never call a ref from a render pass that did not commit. When a component renders more than once before its commit, for example because a child updated it while rendering, the refs from its earlier passes are now dropped. Previously each one was called with `null` without ever being attached and then attached anyway, so a callback ref returning a React 19 cleanup could receive `null` (`ResizeObserver.observe(null)` throws) and its cleanup never ran. A ref that a later pass restores to the one already committed is left alone, and a host that mounts and unmounts before its commit never calls its ref.
