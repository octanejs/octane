---
'octane': patch
'@octanejs/testing-library': patch
'@octanejs/floating-ui': patch
'@octanejs/zustand': patch
---

Support library components that use transitive and method-based custom hooks,
typed namespaces, and generic interfaces in Octane source. Preserve committed
render-phase state when a render suspends, retain server DOM and hydration data
while a resolved Suspense boundary waits for client data, and support portals
into document fragments and shadow roots.

Make testing-library rendering and hydration settle native effects consistently,
and accept the full Octane renderable input surface.

Batch nested `act` callbacks and testing-library rerenders within their outer
callback. Await the complete promise queue before resolving `act`, including
with frozen timeout clocks, so asynchronous positioning updates settle before
assertions. Expose `isInActScope` for testing helpers to preserve this batching.

Render synchronous iterable template loops on the client and during hydration,
including sets and generators, while preserving the array reconciliation path.

Run native event handlers outside component render scope when a DOM update
synchronously dispatches an event, such as blur from disabling a focused input.

Complete finite layout-effect update cascades before publishing DOM mutations to
observers, including scheduled updates and repeated measurements in one component.

Preserve optional method-hook chains, including skipped arguments, method
receivers, and short-circuit boundaries in both compiler emission paths.

Retain resolved Suspense native data in the public SSR result as well as its
boundary hydration payload. Retire four Floating UI expected failures now
covered by passing upstream ref and positioning assertions.

Enforce the existing external-store snapshot stability contract during commit
cascades. Uncached Zustand object selectors reach the update-depth guard; use
`useShallow` to cache their selected values.
