---
'octane': patch
---

Two server head-hoisting behaviors reach React Fizz parity, closing the last
Float engine gaps from the React 19 parity audit.

Fallback hoistables are now suppressed transitively: a `<title>`/`<meta>`/
`<link>` authored inside a pending boundary's fallback never reaches the
streamed head, including from a completed boundary nested inside that fallback
— the fallback is discarded at reveal, but a streamed head line is permanent.

Priority hoistables now lead the server head: `<meta charSet>` serializes
first (parsers only honor a charset within the first 1024 bytes), then
`<meta name="viewport">`, then everything else in discovery order — matching
React's ordering instead of pure discovery order.

The parity ledger also gains evidence for the `identifierPrefix` root option
and the external-store compatibility semantics (subscribe/snapshot/
server-snapshot through `useSyncExternalStore`), retiring those planned cases.
