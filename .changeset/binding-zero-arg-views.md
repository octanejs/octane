---
'octane': patch
---

`'use dom bindings'` views may now declare no props parameter. A view that reads only module-scope signal handles, such as an island's state, compiles for `adoptBindings`, `mountBindings` and server rendering like a view with props. Views with more than one parameter are still rejected.
