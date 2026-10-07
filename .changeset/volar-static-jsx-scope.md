---
'octane': patch
---

Type-check static component elements in the scope they were written in. The
editor's virtual TSX, which `octane-tsc` also checks, moved an element with only
literal attributes and children to a module-level `const`. When that element
was a component, its tag was checked against the wrong binding:

- A named function expression that renders itself, such as
  `export default (function Counter() @{ … <Counter nested /> … })` or
  `memo(function Counter() @{ … })`, reported TS2604 or TS2304. It resolved to
  a module binding with the same name, or to nothing.
- An `@if (Maybe) { <Maybe label="x" /> }` arm lost its narrowing.

Component elements now stay where they were written. Host-only static elements
name no binding and still hoist. Runtime output is unchanged.
