---
'octane': patch
---

`octane/react` islands now server-render and hydrate. The new
`octane/react/server` entry runs one synchronous hosted Octane pass per React
server render (Fizz streaming or `renderToString`) against a request-local
session, so Fizz retries replay settled work instead of re-fetching — one
replay per suspension stratum, parallel `use()` fetches started once, and
rejections routed to Fizz exactly once. Island React-context reads call
`React.use` directly on the server; locally-guarded suspensions ship their
`@pending` arms in the shell for the client to complete; scoped island CSS
hoists as deduplicated React 19 style resources that client hydration
recognizes; and hoisted `<title>/<meta>/<link>` from islands is rejected with
a targeted diagnostic. On the client, `OctaneCompat` hydrates a
server-rendered host in place: Octane adopts the exact server node identities
(byte-identical `useId` values, preserved state, live events) while React
never touches the island's descendants. Also closes the escape-protocol
matrix: island layout/passive/ref faults surface in the nearest React error
boundary, and update suspensions over committed content preserve hidden
island DOM and state (transition-originated episodes refallback in v1 — a
documented divergence).
