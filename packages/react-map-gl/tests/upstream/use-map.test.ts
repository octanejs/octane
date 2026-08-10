/** Ported from upstream/test/components/use-map.spec.jsx. */
import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import {
	EnclosingMapProbe,
	NoMapProvider,
	OneMapProvider,
	TwoMapsProvider,
} from '../_fixtures/upstream-apps.tsrx';

function mapProps() {
	return { mapLib: Promise.resolve(mapboxgl), mapboxAccessToken: 'test-token' };
}

describe('useMap', () => {
	// Per upstream/test/components/use-map.spec.jsx:8 ('useMap')
	// @parity-case ported:use-map:1
	it('publishes every mounted map by id and drops them as they unmount', async () => {
		let maps: any = null;
		const onMaps = (next: any) => (maps = next);

		const view = mount(TwoMapsProvider, {
			mapA: mapProps(),
			mapB: mapProps(),
			onMaps,
		} as any);
		try {
			await settle();

			expect(maps.mapA).toBeTruthy();
			expect(maps.mapB).toBeTruthy();

			view.update(OneMapProvider, { mapA: mapProps(), onMaps } as any);
			await settle();

			expect(maps.mapA).toBeTruthy();
			expect(maps.mapB).toBeFalsy();

			view.update(NoMapProvider, { onMaps } as any);
			await settle();

			expect(maps.mapA).toBeFalsy();
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/src/components/use-map.tsx:59 — `current` is the enclosing
	// map, which is how a child component reaches the map it lives inside
	// without knowing its id.
	// @parity-case ported:use-map:2
	it('exposes the enclosing map as `current` to a child of that map', async () => {
		let maps: any = null;
		const view = mount(EnclosingMapProbe, {
			mapA: mapProps(),
			onMaps: (next: any) => (maps = next),
		} as any);
		try {
			await settle();

			expect(maps.current).toBeTruthy();
			expect(maps.current.getMap()).toBe(maps.mapA.getMap());
		} finally {
			act(() => view.unmount());
		}
	});
});
