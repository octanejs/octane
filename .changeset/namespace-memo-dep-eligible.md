---
'octane': patch
---

Treat `const Row = React.memo(Component)` the same as a named `memo` import when
`React` is `import * as React from 'octane'`. The compiler only recognized the
named form as an immutable memo wall, so a `@for` row rendering a
namespace-imported memo component lost its dependency-compare fast path and
re-rendered every row on each parent update. Such rows now keep the same
`@for` flags as the named form. A namespace import from another module stays
opaque.
