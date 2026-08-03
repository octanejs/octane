---
'@octanejs/shadcn': patch
---

Fix the Base UI `slider` rendering two thumbs for a scalar value.

`value` and `defaultValue` are typed `number | number[]`, because Base UI's Slider accepts a scalar
for a single-value slider. The thumb count was derived with `Array.isArray` alone, so a scalar fell
through to the `[min, max]` range fallback: `defaultValue={30}` rendered two thumbs against a
one-value slider, the second with no value behind it. An omitted value still falls back to the range
default, which is upstream's behavior in both bases.
