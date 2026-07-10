---
'octane': patch
---

Marker elision M1 (docs/comment-marker-elision-plan.md): components whose body provably renders one plain element now carry a compiler-emitted `$$singleRoot` stamp on their exported binding, and call sites whose callee is an IMPORTED identifier (stable identity — local variable callees are excluded) pass a sentinel so `componentSlot` takes the existing markerless singleRoot mount path cross-module. Client-mount comment pairs drop for qualifying components; SSR output and hydration adoption are unchanged (same contract as forBlock's singleRoot items). Pinned by the marker-shape structural tests.
