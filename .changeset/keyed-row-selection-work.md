---
'octane': patch
---

Reduce keyed-row selection work for compiler-proven class-only updates. Preserve full row reconciliation for live renderable children and use the correct class setter for statically known HTML, SVG, and MathML templates. Also avoid unnecessary state-update allocations and focus traversal when a document has no focused control.
