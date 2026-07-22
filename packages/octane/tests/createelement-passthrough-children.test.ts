import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import { App } from './_fixtures/createelement-passthrough-children.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/createelement-passthrough-children.tsrx';

// tanstack.com Phase 2c: the octane flavor SSR'd an ENTIRELY EMPTY <body> —
// @octanejs/tanstack-router's Body re-parents the compiled children block via
// createElement positional children into a passthrough component
// ((props) => props.children). The children must render through that chain in
// BOTH compile modes.
describe('createElement passthrough of compiled children blocks', () => {
	it('client: children render through the createElement re-parent chain', () => {
		const mounted = mount(App as any, {});
		try {
			expect(mounted.find('[data-probe="static"]').textContent).toBe('static child');
		} finally {
			mounted.unmount();
		}
	});

	it('server: children render into the SSR html', () => {
		const server = loadServerFixture(FIXTURE);
		const { html } = ServerRuntime.renderToString(server.App, {});
		expect(html).toContain('static child');
		expect(html).toContain('text');
		expect(html).toContain('id="__app"');
	});
});
