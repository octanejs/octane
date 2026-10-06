---
"octane": minor
---

Handle hydration mismatches the way React 19 does.

- **Fallback:** a structural or text mismatch is no longer repaired in place. The nearest Suspense boundary, `@try` boundary, `<Hydrate>` island, or the root discards its server DOM, renders on the client, and reports once through `onRecoverableError`.
- **Attributes and raw HTML:** attributes and `dangerouslySetInnerHTML` are never patched. Production compares nothing, and development warns.
- **Root:** a root keeps showing its server DOM until its client render commits. Its `<Hydrate independent>` widgets survive the fallback with their DOM and state.

Apps that only call `createRoot` no longer ship any hydration code. In production, `setHTML`'s `<script>` normalization is no longer needed and is gone (#1785).
