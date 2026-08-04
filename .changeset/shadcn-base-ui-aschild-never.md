---
'@octanejs/shadcn': patch
---

Type `asChild` as `never` on the Base UI base's `badge`, `breadcrumb` and `item`.

Those families ship without the escape hatch, but their props spread accepted anything, so markup
carried over from the Radix base type-checked and the prop was silently dropped — rendering the
wrapper AND its child. For `BreadcrumbLink` that means an anchor nested inside an anchor: invalid
markup, produced silently. It is now a compile error that points at the header explaining why.
