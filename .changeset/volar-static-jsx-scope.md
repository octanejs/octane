---
'octane': patch
---

Type-check static JSX in the scope it was written in. The editor's virtual TSX,
which `octane-tsc` also checks, moved an element with only literal attributes
and children to a module-level `const`. That optimization only helps React at
runtime, and in a file that is never run it caused false errors:

- A named function expression that renders itself, such as
  `export default (function Counter() @{ … <Counter nested /> … })` or
  `memo(function Counter() @{ … })`, reported TS2604 or TS2304. It resolved to
  a module binding with the same name, or to nothing.
- An `@if (Maybe) { <Maybe label="x" /> }` arm lost its narrowing.
- A `@{}` component returned from a plain function reported TS2304 for a
  `const` that was never emitted.

Every element is now checked where it was written. Runtime output is unchanged.
