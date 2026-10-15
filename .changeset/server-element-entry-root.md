---
'octane': patch
---

A server render given an element, such as `renderToString(<App />)` or
`renderToReadableStream(<App />)`, renders `App` as the root, exactly as
`renderToString(App, props)` does and as `hydrateRoot` renders an element.
Its HTML no longer wraps the root in a range of its own, which made hydration
of a root that renders a template or host elements, or of one that returns a
component, fragment or Suspense boundary on earlier releases, fail and render
on the client with a recoverable error.
