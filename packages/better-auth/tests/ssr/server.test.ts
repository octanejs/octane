import { createAuthClient } from '@octanejs/better-auth';
import { renderToString } from 'octane/server';
import { describe, expect, it, vi } from 'vitest';
import { SessionReader } from '../_fixtures/client.tsrx';

describe('@octanejs/better-auth server rendering', () => {
	it('renders the session server snapshot without starting a request', () => {
		const fetch = vi.fn(() => {
			throw new Error('server rendering must not fetch the session');
		});
		const client = createAuthClient({
			baseURL: 'http://localhost/api/auth',
			fetchOptions: { customFetchImpl: fetch },
		});

		const { html } = renderToString(SessionReader, { client });

		expect(html).toContain('<p id="session">pending</p>');
		expect(fetch).not.toHaveBeenCalled();
	});
});
