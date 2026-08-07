import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import { PlainMap } from '../_fixtures/map-apps.tsrx';

describe('Map smoke', () => {
	it('creates a map instance and exposes it through the ref prop', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(PlainMap, {
			ref,
			mapLib: Promise.resolve(mapboxgl),
			mapboxAccessToken: 'test-token',
			initialViewState: { longitude: -100, latitude: 40, zoom: 4 },
		} as any);
		try {
			await settle();

			expect(ref.current).toBeTruthy();
			expect(ref.current.getCenter().lng).toBe(-100);
			expect(ref.current.getCenter().lat).toBe(40);
			expect(ref.current.getZoom()).toBe(4);
		} finally {
			act(() => view.unmount());
		}
	});
});
