---
'octane': patch
---

Resolve component-root template namespaces statically when the root tag is
unambiguous. A component body whose root tag exists in exactly one namespace
(`header`, `div`, `g`, `mi`, …) now compiles with the concrete `template()`
namespace flag instead of the opaque flag, so `clone()` skips the per-clone
destination-namespace walk on first mount and hydration. Genuinely ambiguous
roots (`a`, `title`, `script`, `style`, `font`, custom elements, unknown tags,
mixed fragments) keep the opaque flag and its per-destination resolution.
