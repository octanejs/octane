---
'@octanejs/shadcn': patch
---

Add `field` to the Base UI base, at `@octanejs/shadcn/base-ui/Field`. That base now covers 31 of 44
families. Transcribed from upstream's Base UI source, class strings verbatim.

Upstream does not route this family through Base UI's `Field` primitive, even though one exists
whose parts line up exactly. It is host elements plus this base's own `Label` and `Separator`, so
the component is the Radix one apart from those two imports.

That is what makes the class strings correct as written: `data-invalid` and `data-disabled` here are
set by the consumer, so `data-[invalid=true]:text-destructive` and
`group-data-[disabled=true]/field:opacity-50` match. Routed through `Field.Root`, the primitive
would emit bare `data-invalid=""` and every one of those variants would silently match nothing.

It also keeps `FieldLabel` usable standalone: it renders the plain `<label>`, not `Field.Label`,
which hard-requires a `<Field.Root>` ancestor and throws without one.
