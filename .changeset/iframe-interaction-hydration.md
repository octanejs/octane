---
"octane": patch
---

Fix nested interaction hydration in same-origin iframe ShadowRoots when the runtime belongs to the parent window. Preserve server-rendered targets and replay the activating event once, including events dispatched on foreign text nodes.
