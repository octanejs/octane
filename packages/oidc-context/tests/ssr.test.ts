// Per packages/oidc-context/upstream/canonical/test/SSR.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerAuth } from './_fixtures/ssr.tsrx';

vi.mock('oidc-client-ts', function () {
	return import('./_mocks/oidc-client-ts');
});

describe('In a Node SSR environment', function () {
	it('auth state is initialised', function () {
		const { html } = renderToString(ServerAuth);

		// Upstream RTL in node never runs the initialize effect, so the first
		// paint is the reducer initial state: loading, unauthenticated, no user.
		expect(html).toContain('id="loading"');
		expect(html).toContain('>true<');
		expect(html).toContain('id="authenticated"');
		expect(html).toContain('>false<');
		expect(html).toContain('>none<');
	});
});
