---
'octane': patch
---

Fix two React-JSX (`.tsx`) compiler backwards-compat gaps. A prop or local referenced
only inside a spread (`{...expr}`) is now forwarded into the lowered fragment — previously
the spread applied nothing (prop) or threw a ReferenceError (local), because the
reference analysis that builds the `createElement(_frag, {…})` arg object only walked
attribute values and text holes, not spread expressions. And a JSX comment child
(`{/* … */}`) now compiles to nothing (matching React) instead of an empty interpolation
hole that produced a build error. The `.tsrx` directive form was already correct.
