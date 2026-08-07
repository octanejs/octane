/** Ported from upstream/test/components/marker.spec.jsx. */
import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import { MarkerMap, MarkerWithContentMap, BareMap } from '../_fixtures/upstream-apps.tsrx';

function baseProps(markerProps: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
	return {
		mapLib: Promise.resolve(mapboxgl),
		mapboxAccessToken: 'test-token',
		markerProps,
		...overrides,
	};
}

describe('Marker', () => {
	// Per upstream/test/components/marker.spec.jsx:9 ('Marker')
	// @parity-case ported:marker:1
	it('attaches to the DOM, exposes the instance, and updates its props', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(MarkerMap, baseProps({ ref, longitude: -122, latitude: 38 }) as any);
		try {
			await settle();

			expect(view.container.querySelector('.mapboxgl-marker')).not.toBeNull();
			expect(ref.current).toBeTruthy();

			const marker = ref.current;
			const offset = marker.getOffset();
			const draggable = marker.isDraggable();
			const rotation = marker.getRotation();
			const pitchAlignment = marker.getPitchAlignment();
			const rotationAlignment = marker.getRotationAlignment();

			view.update(
				MarkerMap,
				baseProps({ ref, longitude: -122, latitude: 38, offset: [0, 0] }) as any,
			);
			await settle();
			expect(marker.getOffset()).toBe(offset);

			let callbackType = '';
			view.update(
				MarkerMap,
				baseProps({
					ref,
					longitude: -122,
					latitude: 38,
					offset: [0, 1],
					rotation: 30,
					draggable: true,
					className: 'classA',
					pitchAlignment: 'map',
					rotationAlignment: 'map',
					onDragStart: () => (callbackType = 'dragstart'),
					onDrag: () => (callbackType = 'drag'),
					onDragEnd: () => (callbackType = 'dragend'),
				}) as any,
			);
			await settle();

			expect(marker.getOffset()).not.toBe(offset);
			expect(marker.isDraggable()).not.toBe(draggable);
			expect(marker.getRotation()).not.toBe(rotation);
			expect(marker.getPitchAlignment()).not.toBe(pitchAlignment);
			expect(marker.getRotationAlignment()).not.toBe(rotationAlignment);
			expect(marker.getElement().classList.contains('classA')).toBe(true);

			marker.fire('dragstart');
			expect(callbackType).toBe('dragstart');
			marker.fire('drag');
			expect(callbackType).toBe('drag');
			marker.fire('dragend');
			expect(callbackType).toBe('dragend');
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/test/components/marker.spec.jsx:78 — marker removed with its element.
	// @parity-case ported:marker:2
	it('detaches the marker element when the marker leaves the tree', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(MarkerMap, baseProps({ ref, longitude: -100, latitude: 40 }) as any);
		try {
			await settle();
			expect(view.container.querySelector('.mapboxgl-marker')).not.toBeNull();

			view.update(BareMap, {
				mapLib: Promise.resolve(mapboxgl),
				mapboxAccessToken: 'test-token',
			} as any);
			await settle();

			expect(view.container.querySelector('.mapboxgl-marker')).toBeNull();
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/test/components/marker.spec.jsx:93 — custom children render.
	// @parity-case ported:marker:3
	it('renders children into a marker-owned element instead of the default pin', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			MarkerWithContentMap,
			baseProps({ ref, longitude: -100, latitude: 40 }) as any,
		);
		try {
			await settle();

			expect(view.container.querySelector('#marker-content')).not.toBeNull();
			// A binding-created element, not the double's default pin.
			expect(ref.current.getElement().dataset.pin).toBeUndefined();
			expect(ref.current.getElement().querySelector('#marker-content')).not.toBeNull();
		} finally {
			act(() => view.unmount());
		}
	});

	// OCTANE DIVERGENCE[react-map-gl-refs-as-props][ported:marker:1]: like every component here, Marker takes its ref as a plain prop. Upstream also detects children with
	// React.Children.forEach. A `.tsrx` parent hands the binding a children block,
	// so the port also accepts that shape — a childless marker must still get
	// Mapbox's own pin, or every marker would silently lose its default icon.
	// @parity-case ported:marker:4
	it('uses the Mapbox default pin when the marker has no children', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(MarkerMap, baseProps({ ref, longitude: -100, latitude: 40 }) as any);
		try {
			await settle();

			expect(ref.current.getElement().dataset.pin).toBe('default');
			expect(ref.current.getElement().childElementCount).toBe(0);
		} finally {
			act(() => view.unmount());
		}
	});
});
