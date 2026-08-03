---
'@octanejs/shadcn': patch
---

Add `avatar`, `progress`, `slider`, `toggle` and `toggle-group` to the Base UI base, at
`@octanejs/shadcn/base-ui/<Family>`. That base now covers 28 of 44 families.

Each was adapted against the primitive's real rendered output rather than copied from the Radix
base, because three of the five differ structurally:

- `progress` sizes its fill by an inline `width` percentage that the primitive writes itself. Radix
  leaves the fill to the consumer, so its base ships a compensating `translateX(-(100 - value)%)`;
  applied on top of Base UI's own width that offsets a correctly sized bar a second time. It also
  gains a `Track` part Radix lacks.
- `slider` is transcribed from upstream's Base UI source rather than derived. It runs on a
  different part tree — `Root > Control > Track > Indicator`, with the thumbs as siblings of the
  track — and forwards `thumbAlignment="edge"`. Nesting a thumb inside the track clips it to a
  sliver against the track's `overflow-hidden` and `h-1`, which reads as a missing thumb.

  One departure from that source: upstream writes its orientation variants as `data-horizontal:` /
  `data-vertical:`, and no `@octanejs/base-ui` primitive emits those attributes — the slider emits
  `data-orientation="horizontal" | "vertical"`. They are written as `data-[orientation=…]:` here;
  verbatim, the track would match no height rule and render as an invisible rail. Whether the
  primitives should be emitting the newer attribute names is a separate question about
  `@octanejs/base-ui`.
- `toggle` and `toggle-group` publish a bare `data-pressed` attribute where Radix publishes
  `data-state="on"`, and Base UI has no `ToggleGroup.Item` part at all: its items are ordinary
  `Toggle`s carrying a `value`.
- `avatar` maps one-to-one and depends on no primitive-emitted attribute.

`ToggleGroup` translates shadcn's `type="single" | "multiple"` to Base UI's `multiple` boolean, so
existing markup keeps working. Its `value`, `defaultValue` and `onValueChange` speak `string[]` in
both modes, matching the primitive, where the Radix base's single mode speaks a bare string.
