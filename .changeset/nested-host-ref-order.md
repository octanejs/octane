---
'octane': patch
---

Nested elements rendered by one component now attach their refs child first, as React does. Before, an element's ref ran before the refs of the elements inside it whenever both came from the same template, spread props, or `createElement` tree, so `<p ref={a}><i ref={b} /></p>` called `a` before `b`. A `<Fragment ref>` still attaches before its children, as in React.
