---
'octane': patch
---

SSR: tag server-compiled `__schildren` component-children render-fns with
`markChildrenBlock`, matching the client emission. Untagged, a component's
render-prop check (`typeof children === 'function' &&
!isChildrenBlock(children)`) misfired on the server only — the children block
was INVOKED as a render prop, returned its HTML string, and the enclosing hole
escaped that markup into visible text (e.g. the router `<Link><img/></Link>`
logo rendering as raw `src="data:image/svg+xml,…"` text before hydration, plus
hydration mismatches). Regression test:
packages/octane/tests/hydration/children-local-hydrate.test.ts.
