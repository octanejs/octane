---
'@octanejs/shadcn': patch
---

Add `breadcrumb` to the Base UI base, at `@octanejs/shadcn/base-ui/Breadcrumb`. That base now covers
33 of 44 families.

Every part is a plain host element with no primitive underneath, so the class strings carry across
from the Radix source verbatim and there is no state-attribute dialect to translate.

`BreadcrumbLink` ships without its `asChild` escape hatch. Radix swaps in `Slot`; React Aria routes
through RAC's own `Link` primitive; Base UI has neither, and nothing available settles whether
upstream's Base UI breadcrumb implements a `render` prop itself. Adding it later is additive,
shipping the wrong spelling would be breaking. A router link still works by carrying the classes
itself — it only loses the `data-slot="breadcrumb-link"` hook.
