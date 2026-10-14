---
'octane': minor
---

Change the server HTML that hydration reads (hydration protocol version 2). A
Suspense boundary is now one comment range whose opening comment records what the
server rendered: `<!--[$:N-->` its content, `<!--[$?id-->` a streamed boundary,
or `<!--[$!rN-->` a boundary the client renders. The `oct-suspense:`,
`oct-seed:`, `oct-client:`, `oct-client-error:` and `oct-native-fresh:` comments
and the arm's own nested range are gone, and so is the range an `@if` or
`@switch` arm had inside its slot's. Pages carry fewer comment nodes.

The server and the client must come from the same Octane version: a root whose
server rendered another protocol version renders on the client and reports
error 348 through `onRecoverableError`. A presentation-binding view keeps its
own boundary and arm shapes.
