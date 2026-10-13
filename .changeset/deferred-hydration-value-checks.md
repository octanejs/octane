---
'octane': patch
---

Reduce production hydration bundle size by loading class, style, attribute, and HTML comparison work only for deferred Hydrate boundaries. Ordinary hydration still keeps server values, and deferred boundaries still preserve matching DOM and recover when their content has changed.
