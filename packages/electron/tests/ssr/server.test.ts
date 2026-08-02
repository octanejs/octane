import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { ServerCommand } from '../_fixtures/server.tsrx';

describe('@octanejs/electron — server rendering', () => {
	it('renders the pending state without reaching for a browser IPC bridge', () => {
		expect(typeof globalThis.window).toBe('undefined');
		const { html } = renderToString(ServerCommand);
		expect(html).toContain('<div id="server-status">pending</div>');
	});
});
