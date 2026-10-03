---
'octane': patch
---

When hydration rebuilds a component's single root over a server element that does not match it, it now also removes whatever else the server rendered in that component's range, such as the rest of another component the server rendered there. Previously, that server content stayed on screen after the rebuilt root, and nothing reported it. The mismatch is still reported once, and the server nodes after the range keep their identity. This also applies when the rebuilding attempt suspended and a later attempt, or a `<Hydrate>` boundary's resume, completes it.
