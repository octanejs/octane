---
'octane': patch
---

Cache a `const` that only another cached calculation reads. In `const labels = formatRows(rows); const view = wrapRows(labels);` with only `view` in the template, `labels` used to recompute on every render, so `view`'s cache never hit and `wrapRows` ran on every render too. Client builds now cache every link of such a chain, keyed on the chain's own inputs, in `@{}` and `return <jsx>` components alike. That includes a `const` read only by a Strong inline render expression. Declarations that are never cached (hook calls, live member calls, `let`, values only an event handler reads) still never are.

Also fix a render crash: a cached calculation whose callback read a `const` declared after it, as in `const reader = make(() => labels); const labels = formatRows(rows);`, threw `Cannot access 'labels' before initialization` because its dependency check read `labels` early. Such a calculation is no longer cached.
