---
'octane': patch
---

Ship generic host props and controlled forms only to apps that create host
element descriptors.

The runtime's value-child path reaches the de-opt host renderers, which apply
props through the generic attribute writer and its controlled-form, style,
event-name and URL tables. A host element descriptor can only come from an
element factory or a dynamic tag that resolves to a host string, so those sites
now install the writer, and an app whose renderable values are compiled bodies,
text and empties no longer bundles it.

The compiler also stops routing two kinds of call site through the generic
component entry, which keeps that capability for runtime string tags:
`<Suspense>` and `<ViewTransition>` imported from `octane` use the void entry,
since their bodies never return a value, and a module `const` bound to `lazy()`
uses a new function-only entry that still reconciles returned values.

On the bundle-size app shell authored in `.tsrx`, client JavaScript drops from
108.7 KB to 99.5 KB gzip when hydrating and from 90.2 KB to 81.3 KB client-only.
