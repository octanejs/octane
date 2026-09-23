import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/local-void-roots.tsrx';

// The octane-prod project configures renderer boundaries for other fixtures, so
// this pins that same-module roots and private contexts behave identically in
// a production build of a boundary-configured project and in dev.
const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/local-void-roots.tsrx',
);
let host: HTMLElement | undefined;

function container() {
	host = document.createElement('div');
	document.body.append(host);
	return host;
}

afterEach(() => {
	host?.remove();
	host = undefined;
});

const EXPECTED = {
	initial: 'first:0first',
	clicked: 'first:1first',
	updated: 'second:1second',
	retained: true,
	cleanups: 1,
	cleaned: true,
};

describe('function-local roots rendering same-module components', () => {
	it('mounts, updates state and props in place, and cleans up', async () => {
		expect(await client.mountLocalRoot(container())).toEqual(EXPECTED);
	});

	it('hydrates server markup, updates state and props in place, and cleans up', async () => {
		const el = container();
		el.innerHTML = renderToString(server.View, { label: 'first' }).html;
		expect(await client.hydrateLocalRoot(el)).toEqual({ ...EXPECTED, adopted: true });
	});
});
