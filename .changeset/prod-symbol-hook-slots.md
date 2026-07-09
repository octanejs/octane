---
'octane': patch
---

Compiler: hook slot symbols are plain `Symbol()` when HMR is off (production builds, SSR) instead of `Symbol.for("octane:<module path>:<Comp>.<hook>#<n>")` — only HMR's module re-import needs the registry identity, and the old form leaked the ABSOLUTE source file path into shipped bundles (~80–120 chars per hook call site). Dev serve keeps the stable `Symbol.for` keys so hook state survives hot swaps, including the plain-`.ts` `slotHooks` pass (now gated by the same flag via the vite plugin).
