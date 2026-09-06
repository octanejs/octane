---
'@octanejs/shadcn': patch
---

Keep the Base UI wrappers compatible with the complete 1.8 binding. Derive
positioning and required value props from the primitives, preserve dialog,
slider, and toggle-group composition in native templates, and check sources and
consumer examples with Octane's compiler.

Preserve Slider value inference for scalar, mutable range, and readonly range
values, including controlled state setters and commit callbacks.
