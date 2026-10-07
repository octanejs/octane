---
'octane': patch
---

Stop development hydration from reporting an empty `style` attribute that an
early binding left behind.

When an early binding (`adoptBindings`) published a single style declaration as
unset before hydration, such as `style={{ opacity: props.opacity }}` with no
opacity, removing that declaration could leave an empty `style=""` on the
element. Development hydration then reported a mismatch where the server
rendered `""` and the client `""`. Hydration now treats the attribute's presence
as the early binding's doing too, and still reports an empty `style` attribute
that the binding did not leave.
