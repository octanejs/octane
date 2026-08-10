---
'octane': patch
---

Fix a sibling-ordering bug in hosts whose children are all components: a hookless child that rendered nothing at mount (for example a sole `@if` with no `@else`) inserted content produced by a later render after its later siblings instead of at its own source position. The compiler now keeps per-child anchors for such hosts, while hosts whose children provably hold their position keep the marker-elided form.
