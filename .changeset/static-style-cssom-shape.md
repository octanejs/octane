---
'octane': patch
---

Compile-time-baked static object styles now serialize in CSSOM shape (`width: 100px; overflow: auto;` — declarations terminated, not separated). Previously a baked `style` attribute dropped the final semicolon, so the same element's style read back differently depending on whether the style was static (template-baked) or dynamic (written through `el.style`) — an observable byte difference in innerHTML comparisons (and vs React, whose styles always go through CSSOM). Applies to both client templates and SSR output, which share the serializer.
