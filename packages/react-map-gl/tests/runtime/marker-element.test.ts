/**
 * Octane-only conformance for which element a `Marker` renders into.
 *
 * Upstream answers this with `React.Children.forEach(props.children, …)` at
 * mount: any truthy child means the marker gets a binding-created element to
 * portal into, and no children means Mapbox draws its own default pin. Octane's
 * compiler lowers a `.tsrx` parent's children to an opaque render function, so
 * the binding cannot ask that question without evaluating the block — which
 * would run any hooks inside it a second time and collide on their call-site
 * slots. It has to infer the answer from what the block actually rendered.
 *
 * That inference is only sound if the portal target is never Mapbox's own pin.
 * These cases pin both halves of it: content that is not there yet must not end
 * up inside the default pin, and a marker that genuinely has no children must
 * still get that pin.
 */
import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import { LateMarkerMap, ToggleContentMarkerMap } from '../_fixtures/map-apps.tsrx';
import { MarkerMap } from '../_fixtures/upstream-apps.tsrx';

const baseProps = (extra: Record<string, unknown>) => ({
	mapLib: Promise.resolve(mapboxgl),
	mapboxAccessToken: 'test-token',
	...extra,
});

describe('marker element', () => {
	it('adopts content that first renders after mount', async () => {
		const markerRef: { current: any } = { current: null };
		const clicks: unknown[] = [];
		const view = mount(
			LateMarkerMap,
			baseProps({ markerRef, onMarkerClick: (e: unknown) => clicks.push(e) }) as any,
		);
		try {
			await settle();

			const element = markerRef.current.getElement();
			// The content exists, exactly once, and the marker is showing it.
			expect(view.container.querySelectorAll('#late-content')).toHaveLength(1);
			expect(element.querySelector('#late-content')).not.toBeNull();
			// And it is the marker's own element, not Mapbox's pin with the
			// consumer's content stuffed inside it — which is what a portal aimed
			// at `marker.getElement()` produces, leaving both drawn at once.
			expect(element.dataset.pin).toBeUndefined();
			expect(view.container.querySelector('[data-pin="default"]')).toBeNull();

			// Adopting the content swaps the marker instance while the element it
			// now owns stays the same node, so a click handler bound per instance
			// would have stacked and reported one click twice.
			act(() => {
				element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			});
			expect(clicks).toHaveLength(1);
			expect((clicks[0] as any).target).toBe(markerRef.current);
		} finally {
			act(() => view.unmount());
		}
	});

	it('falls back to the default pin when the children block renders nothing', async () => {
		const markerRef: { current: any } = { current: null };
		const view = mount(ToggleContentMarkerMap, baseProps({ markerRef, showContent: false }) as any);
		try {
			await settle();

			// The block is opaque, so it reads as "has children" and the marker is
			// built around the binding's element. Nothing rendered into it, so the
			// pin goes back to Mapbox — upstream draws one for a falsy child too,
			// and without this the marker is an empty element and invisible.
			const element = markerRef.current.getElement();
			expect(element.dataset.pin).toBe('default');
			expect(element.querySelector('#toggled-content')).toBeNull();
		} finally {
			act(() => view.unmount());
		}
	});

	it('carries class list changes across the rebuild', async () => {
		const markerRef: { current: any } = { current: null };
		const view = mount(
			ToggleContentMarkerMap,
			baseProps({ markerRef, showContent: false, markerClassName: 'pin' }) as any,
		);
		try {
			await settle();
			expect(markerRef.current.getElement().dataset.pin).toBe('default');

			// A class toggled after mount, the way a consumer marks a selection.
			view.update(
				ToggleContentMarkerMap,
				baseProps({ markerRef, showContent: false, markerClassName: 'pin selected' }) as any,
			);
			await settle();
			expect(markerRef.current.getElement().classList.contains('selected')).toBe(true);

			// Content arriving takes the element back, which builds a new marker.
			// Everything the render body reconciles against the live instance heals
			// itself; the class list is diffed against the previous props instead,
			// which do not change on that render, so it has to be carried over.
			view.update(
				ToggleContentMarkerMap,
				baseProps({ markerRef, showContent: true, markerClassName: 'pin selected' }) as any,
			);
			await settle();

			const element = markerRef.current.getElement();
			expect(element.querySelector('#toggled-content')).not.toBeNull();
			expect(element.classList.contains('pin')).toBe(true);
			expect(element.classList.contains('selected')).toBe(true);
		} finally {
			act(() => view.unmount());
		}
	});

	it('keeps the default pin for a marker with no children', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			MarkerMap,
			baseProps({ markerProps: { ref, longitude: -122, latitude: 38 } }) as any,
		);
		try {
			await settle();

			expect(ref.current.getElement().dataset.pin).toBe('default');
			expect(ref.current.getElement().childElementCount).toBe(0);
		} finally {
			act(() => view.unmount());
		}
	});
});
