---
'octane': patch
---

Keep destructured `.map()` callback parameters writable on the client. A
template `xs.map(({ label }) => <li … />)` compiles to a keyed row loop, and its
destructured fields were re-declared with `const`, so a row handler that
reassigned one, such as `onClick={() => { label = label + '!' }}`, threw
`TypeError: Assignment to constant variable` after mount or hydration. Server
rendering already treated them as ordinary parameters. Identifier parameters
were unaffected.

The same row prologue now keeps the kind of an authored `@for` header, so the
fields of `@for (let { label } of xs)` can be reassigned too. Output for
`const` headers and identifier parameters is unchanged.
