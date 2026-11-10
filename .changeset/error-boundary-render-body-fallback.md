---
'octane': patch
---

`<ErrorBoundary fallback={@{ … }}>` renders the fallback body instead of calling it as an `(error, reset)` render prop, which crashed the client when the boundary was kept as a runtime component.
