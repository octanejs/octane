---
'octane': patch
---

A component that returns a keyed element, a `<noscript>`, or a document element
such as `<body>` from an ordinary `return` now renders that element's `@if`,
`@for`, `@switch`, and `@try` children on the client, including directives
nested in a child element, fragment, or component inside it. The client used to
mount the element empty on every render while the server rendered its content,
and a directive inside a `<>…</>` fragment there failed to compile. A `.tsx`
component returning a keyed element with a `.map()` child rendered it empty in
the same way. The same element in a `@{ … }` body was not affected.
