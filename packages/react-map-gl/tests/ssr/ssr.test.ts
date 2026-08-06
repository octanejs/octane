/**
 * mapbox-gl is a WebGL library with no server rendering, and the binding only
 * loads it inside an effect. The server contract is therefore narrow and worth
 * pinning: emit the container the client will hydrate and mount the map into,
 * and nothing that would need the library.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerMap } from './_fixtures/server.tsrx';

describe('@octanejs/react-map-gl — server rendering', () => {
	it('emits the map container and omits everything that needs the library', () => {
		const { html } = renderToString(ServerMap);

		expect(html).toContain('<h1>Map page</h1>');
		expect(html).toContain('id="server-map"');
		// The author's style is merged over the binding's defaults, so the box the
		// map will fill is already reserved and hydration does not shift the page.
		expect(html).toContain('position:relative');
		expect(html).toContain('width:100%');
		expect(html).toContain('height:400px');

		// Children live behind `mapInstance`, which only exists on the client.
		expect(html).not.toContain('mapboxgl-children');
		expect(html).not.toContain('class="pin"');
		expect(html).not.toContain('mapboxgl-marker');
	});

	it('does not throw when no map library can be loaded', () => {
		expect(() => renderToString(ServerMap)).not.toThrow();
	});
});
