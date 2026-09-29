---
'octane': patch
---

A component that returns a keyed element, a `<noscript>`, or a document element
such as `<body>` or `<html>` from an ordinary `return` now hydrates by adopting
the server element. The client used to mistake that element's own server range
for the component's, so it warned about a list mismatch and rendered a second
copy beside the server element, or silently duplicated a `<noscript>` or
`<body>`, and a returned `<html>` failed to hydrate. Switching such a component
between that element and other output, such as text, no longer leaves the old
element behind. The same element in a `@{ … }` body was not affected.
