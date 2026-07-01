---
"octane": patch
---

Fix the server `createElement` leaking `key` into a component's `props`. The client
`createElement` lifts `key` out of props (React semantics — `key` is never a real prop), but
the server returned the original props object with `key` intact, so `ssrChild` spread it into
the component and a `.tsx` component reading `props.key` saw a value during SSR but `undefined`
on the client. The server now strips `key` copy-on-write, matching the client.
