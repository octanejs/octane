---
'octane': patch
---

A `@catch` parameter written as an object or array pattern, such as `@catch ({ message }: Error, retry)`, now binds its names on the client. Previously the client error arm threw a `ReferenceError` or read a component local with the same name, while server rendering showed the error, so client render and hydration disagreed with SSR. Pattern defaults may read component locals, as in `@catch ({ message = fallback })`.
