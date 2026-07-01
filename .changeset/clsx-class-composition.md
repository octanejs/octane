---
"octane": patch
---

Add clsx-style `class` / `className` composition to the runtime.

`class` and `className` now accept strings, numbers, arrays, objects, and any nesting
of those — composed the same way the `clsx` / `classnames` packages do (falsy parts
drop out; object keys are kept when truthy). For example
`class={['btn', props.size, { active: isActive }, props.extra]}` renders `"btn lg active"`.

- Native, dependency-free: a new `normalizeClass` helper (exported from `octane` and
  `octane/server`) inlines the algorithm and fast-paths plain strings (~3× faster than
  the `clsx` package on the common `class={someString}` path), with byte-identical output.
- Applied at every class site: dynamic bindings, `{...spread}` props, SVG elements
  (via `setClassAttr`, which still removes the attribute on a nullish value), and
  scoped-`<style>` components — where a compiler pre-pass normalizes the value *before*
  the scope hash is appended, so array/object classes compose correctly alongside the
  hash (and a nullish class no longer emits the literal `"undefined <hash>"`).
- SSR (`ssrAttr`) composes identically, so a server-rendered composed class hydrates
  without a mismatch.

This is an intentional divergence from React, which coerces `className={['a','b']}` to
the string `"a,b"`; Octane yields `"a b"`.
