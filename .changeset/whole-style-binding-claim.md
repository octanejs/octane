---
'octane': patch
---

Keep an early binding's whole-`style` publication through hydration, as
single-declaration publications already were.

When an early binding (`adoptBindings`) owned a whole style, such as a
forwarded `style={props.style}`, and published a newer value before hydration,
development reported that value as a hydration mismatch. Once the binding was
released, a render with the hydration-time style did not write it, because
hydration had cached the skipped write as applied, so the early value stayed on
screen. The binding now publishes its style for hydration. Hydration keeps it
without a report, and the next render writes its style even when unchanged.
