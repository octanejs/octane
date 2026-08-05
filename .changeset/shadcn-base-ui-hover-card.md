---
'@octanejs/shadcn': patch
---

Add `hover-card` to the Base UI base, at `@octanejs/shadcn/base-ui/HoverCard`. That base now covers
38 of 44 families.

Runs on `@octanejs/base-ui`'s `PreviewCard`, which is Base UI's name for this family.

The open/closed dialect had to be rewritten, and this one would have failed completely rather than
subtly. This family's Radix source uses the older `data-[state=open]:` / `data-[state=closed]:`
spelling where the other menu families use `data-open:`. Base UI publishes no `data-state` attribute
at all, so every entry and exit utility would have matched nothing and the card would pop in and out
unanimated.

The transform-origin variable is renamed to the generic `--transform-origin`, and positioning props
are routed to the Positioner rather than swept onto the Popup, matching the other Base UI overlays.
