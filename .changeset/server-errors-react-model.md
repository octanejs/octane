---
'octane': minor
---

Server rendering errors now follow React: the server never renders a `@catch` arm or an `<ErrorBoundary>` fallback.

A render error, or a rejected `use()`, inside a Suspense boundary (a `@try` with `@pending`, or `<Suspense>`) now reports through `onError` and ships that boundary's fallback, marked for the client to render, in `renderToString`, `prerender`, and streams before and after the shell. Previously the server rendered the boundary's `@catch` arm and serialized the rejection's name, message, and fields so hydration could adopt it. Now no part of the error reaches the page. `hydrateRoot` renders the boundary afresh from client data, starting its requests again, and reports it once through `onRecoverableError`. If the client render throws too, the boundary's `@catch` arm or the nearest client error boundary shows it, as in any client render.

A server error with no Suspense boundary above it, even inside a `@try` that has only `@catch` or an `<ErrorBoundary>`, now fails the render: `renderToString` throws, `prerender` rejects, and a stream fails its shell through `onShellError`. An app that relied on a server-rendered catch arm, such as a root `catch` boundary without a `pending` one, should wrap the content in a Suspense boundary, whose fallback the server sends while the browser renders the catch arm. An authored `@try`/`@pending` boundary inside `renderToString` now recovers a server error as `<Suspense>` did, instead of failing the render.

A `@try` with only `@catch` no longer holds a suspension on the server, matching React's error boundaries and Octane's client. While something inside it waits, the nearest Suspense boundary's fallback ships, instead of an empty placeholder for that `@try` alone, and with no Suspense boundary above it the shell waits.
