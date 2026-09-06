import { renderToString } from 'octane/server';
import { createStore } from 'redux';
import { describe, expect, it } from 'vitest';
import { ServerStateApp } from '../_fixtures/app.tsrx';

describe('Provider server snapshots', () => {
	it('renders a supplied zero state instead of the live store state', () => {
		const store = createStore(() => 2);
		const html = renderToString(ServerStateApp, { store, serverState: 0 }).html;
		expect(html).toContain('selected=0');
		expect(renderToString(ServerStateApp, { store }).html).toContain('selected=4');
	});
});
