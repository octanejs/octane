---
'octane': patch
---

Reduce production DOM bundles for private contexts whose complete usage is proven to stay in compiled template providers and canonical context reads. Both the context factory and provider call omit generic returned-element and descriptor-child rendering. Exported, escaped, reflected, aliased, and opaque contexts retain the callable context API and generic child support; provider identity, state, SSR adoption, and cleanup stay unchanged.
