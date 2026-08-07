/**
 * Octane-only conformance for where the map's children container sits.
 *
 * The binding shares one DOM container with mapbox-gl, and that makes sibling
 * order load-bearing. mapbox-gl derives every pointer coordinate from the box
 * of `.mapboxgl-canvas-container`, which is `position: static`, so a
 * full-height block placed ahead of it in normal flow displaces it and every
 * point-anchored interaction — wheel zoom, double-click zoom,
 * `queryRenderedFeatures` — is wrong by that offset. Positioning the container
 * instead of moving it only trades that for a second defect: as a positioned
 * element ahead of the canvas in tree order, its descendants paint (and hit-test)
 * beneath the opaque map, so a consumer's overlay disappears.
 *
 * React never has to reason about this because it appends the container after
 * mapbox-gl's DOM. The binding therefore appends it too, rather than rendering
 * it into the template where Octane would anchor it at its authored position.
 *
 * jsdom performs no layout, so neither consequence can be observed here. The
 * ordering that prevents both can be, and that is what this pins. Both were
 * measured in Chrome against mapbox-gl 3.9.0: ahead of the canvas and in flow,
 * `.mapboxgl-canvas-container` was pushed down by the full height of the map
 * (834px); ahead of it and positioned, `elementFromPoint` over a consumer
 * overlay returned the canvas instead of the overlay.
 */
import { describe, expect, it } from 'vitest';
import { mapboxgl, mount, settle } from '../_helpers';
import { MarkerMap } from '../_fixtures/upstream-apps.tsrx';

describe('children container', () => {
	it('is placed after the DOM the map library builds', async () => {
		const view = mount(MarkerMap, {
			mapLib: Promise.resolve(mapboxgl),
			mapboxAccessToken: 'test-token',
			markerProps: { longitude: -122, latitude: 38 },
		} as any);
		await settle();

		const mapContainer = view.container.querySelector(
			'div[style*="position: relative"]',
		) as HTMLElement;
		const children = [...mapContainer.children];
		const childIndex = children.findIndex((child) => child.hasAttribute('mapboxgl-children'));
		const canvasIndex = children.findIndex((child) => child.tagName === 'CANVAS');

		expect(childIndex).toBeGreaterThan(-1);
		expect(canvasIndex).toBeGreaterThan(-1);
		// The whole contract, in one comparison.
		expect(childIndex).toBeGreaterThan(canvasIndex);

		// And it keeps upstream's box: in flow, sized to the map, not positioned.
		const container = children[childIndex] as HTMLElement;
		expect(container.style.height).toBe('100%');
		expect(container.style.position).toBe('');

		view.unmount();
	});

	it('takes the container down with the map when it unmounts', async () => {
		const view = mount(MarkerMap, {
			mapLib: Promise.resolve(mapboxgl),
			mapboxAccessToken: 'test-token',
			markerProps: { longitude: -122, latitude: 38 },
		} as any);
		await settle();

		const mapContainer = view.container.querySelector(
			'div[style*="position: relative"]',
		) as HTMLElement;
		const container = mapContainer.querySelector('[mapboxgl-children]') as HTMLElement;
		expect(container).not.toBeNull();

		view.unmount();
		await settle();

		// Held by reference, not re-queried: unmount detaches the whole subtree, so
		// asking `view.container` for the node afterwards answers null whether or
		// not the effect cleaned up, and the assertion could not fail. What the
		// binding actually owes is the `.remove()` in its own cleanup — the
		// container is appended imperatively, so Octane never adopted it and will
		// not collect it. That shows up as this node losing its parent while its
		// former parent, the map div, still exists.
		expect(mapContainer.isConnected).toBe(false);
		expect(container.parentNode).toBeNull();
		expect(mapContainer.querySelector('[mapboxgl-children]')).toBeNull();
	});
});
