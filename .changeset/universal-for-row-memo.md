---
'octane': patch
---

Skip unchanged `@for` rows on universal renderers, like the DOM target's DEP-PURE
rows.

The universal compiler now proves when a row body renders only from its item, its
index (when the body reads one) and the values it closes over: no hooks, no
components, no refs, no render-time calls other than conversion globals such as
`String`, no writes, and no mutable module or global reads. Event handlers and
other nested functions run after render, so only their captures count. For such
a row it passes those captured values to `universalFor`, and a production render
adopts every survivor whose item, index and captures are unchanged with the same
retained-subtree path an unchanged child component already takes. Dev, HMR and
profiling compiles keep re-rendering every row.

A 1,000-row list with a counter beside it no longer re-renders every row when only
the counter changes, and toggling one row re-renders that row alone.
