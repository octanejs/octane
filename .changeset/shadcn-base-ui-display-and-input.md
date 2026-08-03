---
'@octanejs/shadcn': patch
---

Add `avatar`, `progress`, `slider`, `toggle` and `toggle-group` to the Base UI base, at
`@octanejs/shadcn/base-ui/<Family>`. That base now covers 28 of 44 families.

Each was adapted against the primitive's real rendered output rather than copied from the Radix
base, because three of the five differ structurally:

- `progress` and `slider` size their fill by an inline `width` percentage that the primitive writes
  itself. Radix leaves the fill to the consumer, so its base ships a compensating
  `translateX(-(100 - value)%)`; applied on top of Base UI's own width that offsets a correctly
  sized bar a second time. Both also gain a part Radix lacks — `Progress.Track`, and
  `Slider.Control`, which is the pointer target that Radix's `Root` classes were written for.
- `toggle` and `toggle-group` publish a bare `data-pressed` attribute where Radix publishes
  `data-state="on"`, and Base UI has no `ToggleGroup.Item` part at all: its items are ordinary
  `Toggle`s carrying a `value`.
- `avatar` maps one-to-one and depends on no primitive-emitted attribute.

`ToggleGroup` translates shadcn's `type="single" | "multiple"` to Base UI's `multiple` boolean, so
existing markup keeps working. Its `value`, `defaultValue` and `onValueChange` speak `string[]` in
both modes, matching the primitive, where the Radix base's single mode speaks a bare string.
