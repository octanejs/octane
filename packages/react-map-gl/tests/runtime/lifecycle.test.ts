/**
 * Octane-only conformance for the binding's resource lifecycle.
 *
 * mapbox-gl holds a WebGL context and a worker pool per map, so when those are
 * released is a consumer-visible property, not an implementation detail — and it
 * is not something the upstream suite observes.
 */
import { describe, expect, it } from 'vitest';
import { act, flushEffects, flushSync, mapboxgl, mount, settle } from '../_helpers';
import { MarkerMap, SourceLayerMap, ToggleChildrenMap } from '../_fixtures/upstream-apps.tsrx';

function base(extra: Record<string, unknown> = {}) {
	return {
		mapLib: Promise.resolve(mapboxgl),
		mapboxAccessToken: 'test-token',
		...extra,
	};
}

describe('resource lifecycle', () => {
	it('releases the map before root unmount returns', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			MarkerMap,
			base({ ref, markerProps: { longitude: -1, latitude: 2 } }) as any,
		);
		await settle();
		const instance = ref.current.getMap();
		expect(instance.removed).toBe(false);

		view.root.unmount();
		expect(instance.removed).toBe(true);

		flushEffects();
		flushSync(() => {});
		expect(instance.removed).toBe(true);
	});

	// Upstream removes dependent layers before their source because parent effect
	// cleanups run before child ones; a source removed first would strand its
	// layers and make mapbox throw on the next style diff.
	it('removes a layer before the source it depends on', async () => {
		const ref: { current: any } = { current: null };
		const removals: string[] = [];
		const view = mount(
			SourceLayerMap,
			base({
				ref,
				sourceProps: {
					id: 'my-data',
					type: 'geojson',
					data: { type: 'Point', coordinates: [0, 0] },
				},
				layerProps: { id: 'my-layer', type: 'circle' },
			}) as any,
		);
		await settle();

		const map = ref.current.getMap();
		const removeLayer = map.removeLayer.bind(map);
		const removeSource = map.removeSource.bind(map);
		map.removeLayer = (id: string) => {
			removals.push(`layer:${id}`);
			return removeLayer(id);
		};
		map.removeSource = (id: string) => {
			removals.push(`source:${id}`);
			return removeSource(id);
		};

		act(() => view.unmount());

		expect(removals).toContain('layer:my-layer');
		expect(removals).toContain('source:my-data');
		expect(removals.indexOf('layer:my-layer')).toBeLessThan(removals.indexOf('source:my-data'));
	});

	// A <Popup> that leaves the tree while its map stays mounted must take the
	// popup element with it. Mapbox owns that element, so only the component's
	// effect cleanup can remove it — if the cleanup is skipped, an empty popup
	// shell is left pinned to the map forever.
	it('removes the popup element when only the popup leaves the tree', async () => {
		const view = mount(ToggleChildrenMap, base({ showPopup: true, showMarker: false }) as any);
		try {
			await settle();
			expect(view.container.querySelectorAll('.mapboxgl-popup')).toHaveLength(1);

			view.update(ToggleChildrenMap, base({ showPopup: false, showMarker: false }) as any);
			await settle();

			expect(view.container.querySelector('#popup-content')).toBeNull();
			expect(view.container.querySelectorAll('.mapboxgl-popup')).toHaveLength(0);
		} finally {
			act(() => view.unmount());
		}
	});

	// Same contract for a marker leaving the tree on its own.
	it('removes the marker element when only the marker leaves the tree', async () => {
		const view = mount(ToggleChildrenMap, base({ showPopup: false, showMarker: true }) as any);
		try {
			await settle();
			expect(view.container.querySelectorAll('.mapboxgl-marker')).toHaveLength(1);

			view.update(ToggleChildrenMap, base({ showPopup: false, showMarker: false }) as any);
			await settle();

			expect(view.container.querySelector('#marker-content')).toBeNull();
			expect(view.container.querySelectorAll('.mapboxgl-marker')).toHaveLength(0);
		} finally {
			act(() => view.unmount());
		}
	});

	// A marker's DOM element belongs to mapbox-gl, so removing the component has
	// to take the element with it or every removed pin would stay on the map.
	it('detaches a marker element when only the marker unmounts', async () => {
		const view = mount(MarkerMap, base({ markerProps: { longitude: -1, latitude: 2 } }) as any);
		await settle();
		expect(view.container.querySelectorAll('.mapboxgl-marker')).toHaveLength(1);

		act(() => view.unmount());

		expect(view.container.querySelectorAll('.mapboxgl-marker')).toHaveLength(0);
	});
});
