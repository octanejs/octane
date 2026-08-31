# @octanejs/react-map-gl

Mapbox GL JS bindings for Octane — a port of
[`@vis.gl/react-mapbox@8.1.2`](https://github.com/visgl/react-map-gl), the
package `react-map-gl/mapbox` re-exports.

```bash
npm install @octanejs/react-map-gl mapbox-gl
pnpm add @octanejs/react-map-gl mapbox-gl
```

`mapbox-gl` is an optional peer dependency (`>= 3.5.0`) and is never bundled.
From v2 it ships under the Mapbox Terms of Service and bills per map load, so
you bring your own copy and your own access token.

```tsx
import { Layer, Map, Marker, NavigationControl, Source } from '@octanejs/react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export function CityMap() @{
	<Map
		mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
		initialViewState={{ longitude: -122.4, latitude: 37.8, zoom: 11 }}
		mapStyle="mapbox://styles/mapbox/streets-v12"
		style={{ width: '100%', height: 480 }}
	>
		<NavigationControl />
		<Marker longitude={-122.4} latitude={37.8}>
			<span class="pin">📍</span>
		</Marker>
		<Source id="places" type="geojson" data={places}>
			<Layer id="places-circles" type="circle" paint={{ 'circle-radius': 6 }} />
		</Source>
	</Map>
}
```

## Compatibility

Complete against the pinned upstream public surface: `Map` (also the default
export), `Marker`, `Popup`, `Source`, `Layer`, `AttributionControl`,
`FullscreenControl`, `GeolocateControl`, `NavigationControl`, `ScaleControl`,
`useControl`, `MapProvider`, `useMap`, and every published type.

Both `@octanejs/react-map-gl` and `@octanejs/react-map-gl/mapbox` resolve to the
same surface, so either import style works.

Upstream's framework-neutral half — the Mapbox engine, the proxy transform, the
map ref and six utility modules — is reused **byte-for-byte**, and upstream's own
specs for it run here against both upstream's source and this package's copies.

## Intentional differences

**Refs are plain props.** Octane has no `forwardRef`, so `Map`, `Marker`, `Popup`
and `GeolocateControl` declare `ref` as an ordinary prop. `<Map ref={mapRef} />`
is unchanged; only your own `forwardRef` wrappers need removing.

**`<Source>` publishes its id through context.** Upstream clones each child with
`{source: id}`. Octane cannot clone a compiled children block, so the id travels
by context instead. The enclosing source still wins over a `source` set on the
layer, exactly as `cloneElement` made it win — but the id now reaches *any*
descendant `<Layer>`, not just direct children. Give a layer an explicit source
and keep it outside the `<Source>` if it must not belong to it.

**`<Marker>` picks its element from what your children rendered.** Upstream asks
`React.Children.forEach` whether it was handed a truthy child, and gives the
marker its own element to portal into if so. A compiled children block is opaque,
and evaluating it to look inside would re-run any hooks it contains against the
same call-site slots, so this binding infers the answer from what the block
rendered and rebuilds the marker once it knows. Children that render something,
render nothing, or first render after mount all behave as they do upstream. The
one difference: a child that stays truthy while never rendering anything gets
Mapbox's default pin here, where upstream leaves an empty, invisible element.

**Teardown is not synchronous with unmount.** Effect cleanups run on the passive
drain that follows `root.unmount()`, so `map.remove()` — and with it the WebGL
context and worker pool — happens one drain later. Do not assume the map's
resources are released the instant `unmount()` returns.

**Out of scope.** `react-map-gl/mapbox-legacy` (mapbox-gl v1) and
`@vis.gl/react-maplibre`.

## Server rendering

`Map` renders its container — with your `style` merged over the binding's
defaults, so the box is reserved and hydration does not shift the page — and
omits every child. `mapbox-gl` is imported inside an effect, so nothing on the
server path touches WebGL or a browser global.

`hydrateRoot` adopts that container rather than replacing it: the map is created
inside the node the server emitted, so the reserved box, its style and anything
you rendered around it survive hydration.

## Evidence, and its limits

See [`UPSTREAM.md`](./UPSTREAM.md) for the pin, the full export crosswalk, and
the disposition of every upstream test file. The short version:

- upstream's five framework-neutral specs run byte-exact against both source
  trees;
- upstream's seven component specs need a live Mapbox token and real WebGL under
  puppeteer, so they are ported against a test double — weaker evidence than a
  pristine run, and recorded as such;
- a differential lane runs six fixtures through this binding and through the
  published `@vis.gl/react-mapbox@8.1.2` on React with that same double, which is
  what makes the double trustworthy: the map shell and its overlays,
  `<Source>`/`<Layer>` add-update-remove, in-place popup option edits alongside
  control add and remove, reaching the map by id from outside it to fly the
  camera, `useControl` called straight from a consumer module, and a marker
  choosing between the default pin and a custom element.

Not covered: real WebGL, tile loading, pointer interaction, `reuseMaps`,
external `gl` contexts, and RTL text plugin loading.
