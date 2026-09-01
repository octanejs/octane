---
"octane": patch
---

Scope delegated events to native root boundaries, preserve shadow/slot event paths and logical portal ancestry, and separate framework propagation cancellation from external native stop flags. Native `stopImmediatePropagation()` no longer truncates an already-running delegated handler queue; use `stopPropagation()` as well to stop logical ancestors.

Expose native dialog lifecycle event handlers on logical ancestors in JSX typings.
