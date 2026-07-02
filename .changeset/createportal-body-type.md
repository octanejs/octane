---
"octane": patch
---

Widen `createPortal`'s `body` type to accept any renderable (an `ElementDescriptor`, host
element, array, or text) — the runtime has always normalized these (`normalizePortalBody`);
only the TypeScript signature required a `ComponentBody`. No behavior change.
