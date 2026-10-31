---
'octane': patch
---

Lower JSX nested inside a component's spread attribute, such as
`<View {...{ render: (n) => <Label n={n} /> }} />` or a conditional spread
object, the same way as JSX in a named attribute. The client and server
compilers previously left that JSX in the compiled module, so bundlers failed
to parse it.
