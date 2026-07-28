---
'octane': patch
---

Keep JSX values in the render scope represented by their element tree, including
implicit getter, Proxy, coercion, iterator, and computed-key evaluation. Preserve
context, Suspense, error-boundary, SSR, hydration, and element-descriptor
compatibility when JSX moves into a variable, prop, array, or another value
position. Render deeply nested server component trees without exhausting the
JavaScript call stack across buffered and streaming server-rendering APIs.
