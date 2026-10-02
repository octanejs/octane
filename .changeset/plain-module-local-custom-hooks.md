---
'octane': patch
---

A custom hook in a plain `.ts`/`.js` module that calls another hook declared in
the same module now gives each call its own state, as a `.tsrx` module does.
Previously two calls to a local hook shared their `useState`, `useRef`, `useId`
and memo cells on the client, while the server kept them apart, so hydration
replaced the server's output. This applies to hook functions, hook-named
`const` values and parameters, and aliases of them. Calls to `use*`
functions made while a module initializes, outside any function, are no longer
rewritten, so they no longer throw a `ReferenceError`.
