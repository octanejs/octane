---
'octane': patch
---

Hydration no longer reports a mismatch for a `@try` body or `<ErrorBoundary>` child that throws to its catch arm after adopting server content. A component that cloned its element and then threw from a hole was compared against whatever the server rendered there, often the server's own catch arm, and logged a development mismatch warning and called `onRecoverableError` in development and production. The catch arm replaces that content, so these reports are now dropped. A body that completes or suspends still reports its mismatches, and nested boundaries pass them to the enclosing boundary.
