---
'octane': patch
---

Recover when server HTML loses a hydration range's closing marker instead of
failing the root.

Some HTML minifiers and proxies strip comments, and a range whose `<!--]-->` was
removed made hydration throw `Cannot read properties of null (reading
'nodeType')` and empty the container. Hydration now renders the nearest Suspense
or `<Hydrate>` boundary around the damaged range, or else the root, on the
client and reports one recoverable error through `onRecoverableError`. An
application `@catch` or `ErrorBoundary` does not receive it.
