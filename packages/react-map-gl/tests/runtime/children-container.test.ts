/**
 * Octane-only conformance for where the map's children container sits and how
 * it is positioned.
 *
 * The binding shares one DOM container with mapbox-gl, and mapbox-gl derives
 * every pointer coordinate from the box of `.mapboxgl-canvas-container`. That
 * element is `position: static`, so anything the binding puts *ahead* of it in
 * normal flow displaces it — and every point-anchored interaction (wheel zoom,
 * double-click zoom, `queryRenderedFeatures`) is then wrong by that offset.
 *
 * Upstream never has to think about this: React appends the children container
 * after mapbox-gl's nodes. Octane anchors it at its authored position, ahead of
 * them, so the container must be taken out of flow instead.
 *
 * jsdom performs no layout, so the displacement itself cannot be observed here —
 * `getBoundingClientRect` is all zeros and a full-height block in flow looks
 * identical to one that is not. What this file pins is the property that
 * prevents it. The real geometry was measured in Chrome against mapbox-gl
 * 3.9.0: in flow, `.mapboxgl-canvas-container` was pushed down by the full
 * height of the map (834px) and a pointer at the visual centre resolved 834px
 * above where it should; out of flow, that offset is 0.
 */
import { describe, expect, it } from 'vitest';
import { mapboxgl, mount, settle } from '../_helpers';
import { MarkerMap } from '../_fixtures/upstream-apps.tsrx';

describe('children container', () => {
	it('is taken out of normal flow so it cannot displace the library DOM', async () => {
		const view = mount(MarkerMap, {
			mapLib: Promise.resolve(mapboxgl),
			mapboxAccessToken: 'test-token',
			markerProps: { longitude: -122, latitude: 38 },
		} as any);
		await settle();

		const container = view.container.querySelector('[mapboxgl-children]') as HTMLElement;
		expect(container).not.toBeNull();

		// Out of flow, and covering the whole map exactly as upstream's in-flow
		// `height: 100%` container does.
		expect(container.style.position).toBe('absolute');
		expect(container.style.top).toBe('0px');
		expect(container.style.left).toBe('0px');
		expect(container.style.width).toBe('100%');
		expect(container.style.height).toBe('100%');

		// It positions against the binding's own container, which must therefore
		// stay a positioned element.
		const mapContainer = container.parentElement as HTMLElement;
		expect(mapContainer.style.position).toBe('relative');

		view.unmount();
	});
});
