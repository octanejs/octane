---
'octane': patch
---

Fix `block.body is not a function` when `<Suspense>` or `<ErrorBoundary>` is used
with element children in React-style `.tsx` value position (e.g. inside `.map`,
as in a list of independently-suspending rows). These built-ins render their
children as the try body, which the runtime invokes as a function; `.tsrx` lowers
children to a render function, but a `.tsx` parent lowers element children to a
`createElement` descriptor. The runtime now normalizes either shape to a callable
body, so JSX like `{items.map((id) => <Suspense fallback={…}><Row id={id}/></Suspense>)}`
renders identically whether authored in `.tsrx` or `.tsx`.
