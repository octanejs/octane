---
'octane': patch
---

Optional host and built-in props now accept an explicit `undefined` under `exactOptionalPropertyTypes`, as React's types do. `<div style={open ? { height: 10 } : undefined}>` no longer fails with TS2375. This covers `style`, `for`, `xmlns`, every native event handler, and the Strong JSX and `octane/strong` prop types, plus the props of `Activity`, `ViewTransition`, `Fragment`, `ErrorBoundary` and `ReactCompat`. Without that flag nothing changes.
