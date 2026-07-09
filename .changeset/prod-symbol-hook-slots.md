---
'octane': patch
---

Compiler: hook slot symbols in non-HMR output (production builds, SSR) are now `Symbol("<filenameHash>#<n>")` instead of `Symbol.for("octane:<module path>:<Comp>.<hook>#<n>")` — only HMR's module re-import needs the registry identity, and the old form leaked the ABSOLUTE source file path into shipped bundles (~80-120 chars per hook call site). The short description is load-bearing, not cosmetic: the runtime composes custom-hook slot paths from slot DESCRIPTIONS (`resolveSlot`), so it must stay unique per call site — a bare `Symbol()` collapses the composition and collides custom-hook state (pinned by the new prod-mode hydration smoke test). Dev serve keeps the stable `Symbol.for` keys so hook state survives hot swaps, including the plain-`.ts` `slotHooks` pass.
