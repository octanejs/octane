import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerLiveQuery } from '../_fixtures/server.tsrx';

describe('@octanejs/dexie — server rendering', () => {
	it('renders the configured default without opening IndexedDB or reading browser globals', () => {
		const { html } = renderToString(ServerLiveQuery, {
			db: {
				items: {
					toArray() {
						throw new Error('server rendering must not execute the live query');
					},
				},
			},
		});
		expect(html).toContain('<div id="server-items">server-default</div>');
	});
});
