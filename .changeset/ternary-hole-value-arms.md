---
'octane': patch
---

Render the non-JSX arm of a ternary child hole instead of discarding it, and
stop crashing on a `null` consequent.

`{cond ? A : B}` at a JSX child position lowers to an ifBlock when either arm
is a JSX literal. The other arm's value — a keyed `.map(…)` array, a string, a
variable holding an element, a nested ternary, a falsy primitive — was compiled
into the branch helper as a bare expression statement, so its value was
evaluated and dropped and the hole rendered empty. React renders that arm's
value, and server rendering already did too, so the same component could ship
content from the server that the hydrating client blanked out. A `null`
consequent (`{cond ? null : <Jsx/>}`) did not compile at all: the lowering
crashed reading the missing branch.

A non-JSX arm now lowers to the authored-equivalent `<>{expr}</>`, so the
branch renders the value through the fragment's child hole: keyed `.map` arms
take the same keyed fast path as `@for`, nested ternaries become nested
ifBlocks, and primitives (including `0`) render as text. A `null`/`false`
consequent compiles to an ifBlock with an empty then branch, mirroring the
long-supported `null` alternate. The server now claims template-form ternary
holes symmetrically (`ssrControl` + arm ranges, exactly like an authored
`@if`), so the hydrating client adopts the taken arm's DOM — including keyed
list arms — instead of relying on shape coincidence. Value-form positions
(returned `.tsx` trees, whose holes the client folds into descriptor value
holes) keep their existing `ssrChild` output byte-for-byte.
