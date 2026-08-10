import { flushSync } from 'octane';
import { act, flushEffects, mount } from '../../octane/tests/_helpers';
import mapboxgl from './_mocks/mapbox-gl';

export { act, flushEffects, mount, flushSync, mapboxgl };

/**
 * `Map` resolves its map library through a promise inside an effect, and the
 * double loads its style on a microtask, so a mounted map becomes usable a few
 * turns after render. Upstream's specs poll `isStyleLoaded()` for the same
 * reason; draining explicitly keeps the ported cases deterministic.
 */
export async function settle(turns = 4): Promise<void> {
	for (let i = 0; i < turns; i++) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	flushEffects();
	flushSync(() => {});
}
