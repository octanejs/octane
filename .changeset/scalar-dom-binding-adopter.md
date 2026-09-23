---
'octane': patch
---

Compile fixed-node `'use dom bindings'` views whose channels are all attributes,
booleans, ARIA/data attributes, classes or text to a scalar-only adopter. It keeps
the same claims, signal handles, transition presentation and cleanup, but no
longer ships the projection, control, class-group, style-restoration, host-handoff
or URL-sanitization code these views never use. The documented `adoptBindings`
example is about 41% smaller after gzip. Views with other channels keep the
general adopter.
