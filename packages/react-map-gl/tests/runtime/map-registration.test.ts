/**
 * Octane-only conformance for how `MapProvider` reports a bad map id.
 *
 * `onMapMount` rejects a duplicate id, and `onError` on `<Map>` is the channel
 * for style and network failures. Octane runs state updaters synchronously
 * inside the setter, so registering from inside the library-loading promise put
 * that developer error into the promise's `.catch` and delivered it as a map
 * `onError` — a consumer handling map failures would have logged "Multiple maps
 * with the same id" as if a tile request had failed, and one without an
 * `onError` would have seen it only in the console.
 */
import { describe, expect, it, vi } from 'vitest';
import { mapboxgl, mount, settle } from '../_helpers';
import { DuplicateIdProvider } from '../_fixtures/upstream-apps.tsrx';

function mapProps(extra: Record<string, unknown> = {}) {
	return { mapLib: Promise.resolve(mapboxgl), mapboxAccessToken: 'test-token', ...extra };
}

describe('map registration', () => {
	it('does not report a duplicate map id through the map error channel', async () => {
		const onError = vi.fn();
		const view = mount(DuplicateIdProvider, {
			mapA: mapProps({ onError }),
			mapB: mapProps({ onError }),
		} as any);

		await settle().catch(() => {});

		// Whatever surfaces, it must not arrive dressed as a map failure.
		expect(onError).not.toHaveBeenCalled();

		view.unmount();
	});
});
