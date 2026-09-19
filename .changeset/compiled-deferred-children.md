---
'octane': patch
---

Production DOM compilation uses a smaller deferred hydration body for compiler-generated template children with no authored fallback. Boundaries with `split={false}` can omit generic returned-output and fallback rendering while retaining SSR adoption, interaction replay, suspension and cleanup. Descriptor children, spreads, explicit fallbacks, split loaders and development/HMR builds retain the general Hydrate path.
