---
'@octanejs/react-map-gl': patch
---

Add a Mapbox GL JS binding, ported from `@vis.gl/react-mapbox@8.1.2`.

`react-map-gl@8` is a re-export shell, so the port targets the package its
`./mapbox` subpath actually resolves to. All thirteen runtime exports and every
published type are covered: `Map`, `Marker`, `Popup`, `Source`, `Layer`, the five
controls, `useControl`, `MapProvider` and `useMap`.

Fourteen upstream modules carry no React import — the Mapbox engine, the proxy
transform, the map ref and six utils — and are reused byte-for-byte under a
provenance banner. Upstream's five framework-neutral specs run unmodified
against both upstream's own source and this package's copies, which is what
backs that reuse claim.

`mapbox-gl` is an optional peer and is never vendored: from v2 it ships under the
Mapbox Terms of Service and bills per map load. Upstream's seven component specs
need a live token and real WebGL under puppeteer, so they are ported against a
test double, and a differential lane runs six fixtures through the published
`@vis.gl/react-mapbox@8.1.2` on React with that double so it cannot quietly
flatter the Octane side: the map shell and its portalled overlays,
`<Source>`/`<Layer>` add-update-remove, in-place popup option edits alongside
control add and remove, reaching the map by id from a component outside it to
fly the camera, `useControl` called straight from a consumer module, and a
marker choosing between Mapbox's default pin and a custom element.

Server rendering emits the map container with your `style` merged over the
binding's defaults and nothing that would need the library, and `hydrateRoot`
adopts that container rather than replacing it, so the reserved layout box
survives hydration.

Four intentional differences, all documented in `UPSTREAM.md` and the README:
`<Source>` publishes its id through context rather than `cloneElement`, so it
reaches any descendant `<Layer>`; refs are plain props; effect cleanups — so
`map.remove()` — run on the drain after `unmount()` rather than inside it; and
`<Marker>` picks between its own element and Mapbox's default pin from what its
children rendered, because a compiled children block cannot be inspected the way
`React.Children.forEach` inspects descriptors. Children that render something,
render nothing, or first render after mount all match upstream; a child that
stays truthy while never rendering anything gets the default pin here and an
empty, invisible element upstream.
