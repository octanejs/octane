---
'octane': patch
---

Keep the specialized production root when a private root's later `render` or
`unmount` calls live in callbacks, for example a controller that returns
`replace()` and `dispose()` methods. Before, any use outside the function that
created the root fell back to the generic returned-value renderer, even though
the root never escaped.

Each call in a closure must still be a direct `root.render(...)` or
`root.unmount()` whose render target is a proven compiled component, resolved
from the call's own scope. Returning or passing the root, reading a method,
optional calls, unknown or shadowed targets, direct `eval`, `with`, and uses
inside a component body keep the generic root. A minimal controller entry drops
from about 52 KB to 24 KB gzip.
