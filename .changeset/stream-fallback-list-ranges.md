---
'octane': patch
---

Reveal a streamed Suspense boundary completely when its fallback renders an `@for` list (with items or its `@empty` arm) or a `'use dom bindings'` view directly, rather than inside a host element. The inline swap script now counts those list and binding ranges when removing the fallback. Before, it stopped early: it left the fallback's close marker, which made `hydrateRoot` throw `HierarchyRequestError`, or left fallback nodes visible beside the revealed content. The optional streaming view-transition driver uses the same rule, so it now captures the exit of every fallback element.
