---
'@octanejs/shadcn': patch
---

Add `badge` to the Base UI base, at `@octanejs/shadcn/base-ui/Badge`. That base now covers 32 of 44
families.

No primitive is involved in any base — badge is a `<span>` carrying cva classes — so the variants
are shared verbatim, and a test asserts they render identically to the Radix base for every variant
so the two cannot drift.

The `asChild` / `render` escape hatch is deliberately absent. Upstream's other bases each expose one
and each does it differently (Radix swaps in `Slot`; React Aria takes a `render` function), Base UI
has no `Slot`, and nothing available here settles which shape its badge exposes or whether it
exposes one. Adding it later is additive; shipping the wrong shape would be breaking. Consumers
needing a different element can apply `badgeVariants({ variant })` directly.
