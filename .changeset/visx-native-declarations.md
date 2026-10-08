---
'@octanejs/visx': patch
---

`useSamplesAlongPath` from `@octanejs/visx/drag` declares its return type as
`DOMPoint[]` instead of `never[]`. Its `.tsrx` declarations are now generated
with TypeScript 7.
