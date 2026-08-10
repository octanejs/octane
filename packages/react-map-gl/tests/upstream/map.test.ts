/**
 * Ported from upstream/test/components/map.spec.jsx.
 *
 * Upstream drives a real mapbox-gl@3 with a live access token in a browser; the
 * ported cases run the same component trees against tests/_mocks/mapbox-gl.ts.
 * Every `it` cites the upstream case it comes from.
 */
import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import { BareMap, DelayedSettingsMap, MirrorBackMap } from '../_fixtures/upstream-apps.tsrx';

function baseProps(overrides: Record<string, unknown> = {}) {
	return {
		mapLib: Promise.resolve(mapboxgl),
		mapboxAccessToken: 'test-token',
		...overrides,
	};
}

describe('Map', () => {
	// Per upstream/test/components/map.spec.jsx:9 ('Map')
	// @parity-case ported:map:1
	it('creates the map, reports its camera, and updates it from props', async () => {
		const ref: { current: any } = { current: null };
		let onLoadCalled = 0;
		const view = mount(
			BareMap,
			baseProps({
				ref,
				initialViewState: { longitude: -100, latitude: 40, zoom: 4 },
				onLoad: () => onLoadCalled++,
			}) as any,
		);
		try {
			await settle();

			expect(ref.current).toBeTruthy();
			expect(ref.current.getCenter().lng).toBe(-100);
			expect(ref.current.getCenter().lat).toBe(40);
			expect(ref.current.getZoom()).toBe(4);

			view.update(
				BareMap,
				baseProps({
					ref,
					longitude: -122,
					latitude: 38,
					zoom: 14,
					onLoad: () => onLoadCalled++,
				}) as any,
			);
			await settle();

			expect(ref.current.getCenter().lng).toBe(-122);
			expect(ref.current.getCenter().lat).toBe(38);
			expect(ref.current.getZoom()).toBe(14);
			// The map is created once, so its load event is not replayed on update.
			expect(onLoadCalled).toBe(1);
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/test/components/map.spec.jsx:58 ('Map#invalid token')
	// @parity-case ported:map:2
	it('reports a missing access token through onError', async () => {
		let errorMessage: string | null = null;
		const view = mount(
			BareMap,
			baseProps({
				mapboxAccessToken: undefined,
				initialViewState: { longitude: -100, latitude: 40, zoom: 4 },
				onError: ({ error }: any) => (errorMessage = error.message),
			}) as any,
		);
		try {
			await settle();

			expect(errorMessage).toBeTruthy();
			expect(errorMessage!).toContain('access token');
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/test/components/map.spec.jsx:145 ('Map#uncontrolled#delayedSettingsUpdate')
	// @parity-case ported:map:3
	it('applies a settings prop that changes after load', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			DelayedSettingsMap,
			baseProps({
				ref,
				initialViewState: { longitude: -100, latitude: 40, zoom: 4 },
			}) as any,
		);
		try {
			await settle();
			await settle();

			expect(ref.current.getMaxPitch()).toBe(60);
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/test/components/map.spec.jsx:117 ('Map#controlled#no-update')
	// @parity-case ported:map:4
	it('keeps a controlled camera pinned to props when the map moves itself', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(BareMap, baseProps({ ref, longitude: -100, latitude: 40, zoom: 4 }) as any);
		try {
			await settle();
			expect(ref.current.getCenter().lng).toBe(-100);

			// Upstream animates with easeTo from onLoad; the observable claim is that
			// a map-driven camera move does not survive against controlled props.
			ref.current.easeTo({ center: [-122, 38], zoom: 14 });
			await settle();

			expect(ref.current.getCenter().lng).toBe(-100);
			expect(ref.current.getCenter().lat).toBe(40);
			expect(ref.current.getZoom()).toBe(4);
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/test/components/map.spec.jsx:203 ('Map#controlled#mirror-back')
	// @parity-case ported:map:5
	it('follows the map when onMove writes the view state back into props', async () => {
		const ref: { current: any } = { current: null };
		const seen: any[] = [];
		const view = mount(
			MirrorBackMap,
			baseProps({ ref, onViewState: (vs: any) => seen.push(vs) }) as any,
		);
		try {
			await settle();

			ref.current.easeTo({ center: [-122, 38], zoom: 14 });
			await settle();

			expect(seen.length).toBeGreaterThan(0);
			const center = ref.current.getCenter();
			expect(center.lng).toBeCloseTo(seen.at(-1).longitude, 6);
			expect(center.lat).toBeCloseTo(seen.at(-1).latitude, 6);
		} finally {
			act(() => view.unmount());
		}
	});

	/**
	 * Per upstream/test/components/map.spec.jsx:83 ('Map#uncontrolled') — upstream
	 * asserts the camera animates; the observable claim that survives without a
	 * real animation loop is that an imperative camera move on an UNCONTROLLED map
	 * is kept, and that the ref reports the new position.
	 */
	// @parity-case ported:map:6
	it('keeps an imperative flyTo/zoom on an uncontrolled map', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			BareMap,
			baseProps({ ref, initialViewState: { longitude: -100, latitude: 40, zoom: 4 } }) as any,
		);
		try {
			await settle();
			expect(ref.current.getZoom()).toBe(4);

			ref.current.flyTo({ center: [-122, 38], zoom: 12 });
			await settle();

			expect(ref.current.getCenter().lng).toBe(-122);
			expect(ref.current.getCenter().lat).toBe(38);
			expect(ref.current.getZoom()).toBe(12);

			// Zoom alone, leaving the centre where it is.
			ref.current.easeTo({ zoom: 6 });
			await settle();

			expect(ref.current.getZoom()).toBe(6);
			expect(ref.current.getCenter().lng).toBe(-122);
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/test/components/map.spec.jsx:9 ('Map') — teardown half.
	// @parity-case ported:map:7
	it('destroys the map instance when the component unmounts', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(BareMap, baseProps({ ref }) as any);
		await settle();
		const instance = ref.current.getMap();

		act(() => view.unmount());

		expect(instance.removed).toBe(true);
	});
});
