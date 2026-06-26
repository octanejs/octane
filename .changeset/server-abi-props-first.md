---
'octane': patch
'@octanejs/vite-plugin': patch
---

Unify the server-rendering ABI to props-first, matching the client. A component body is now invoked as `(props, scope, extra)` on the server (it used to be `(scope, props, extra)`). This makes a plain `function Foo(props)` used at a `<Foo/>` site work the same on the server as on the client — including components that return a non-JSX value (a primitive coerced to text, an early return, `null`). SSR markup is unchanged (only the invocation order flipped), so hydration is unaffected. The server layout/page wrappers in the vite-plugin were updated to match.
