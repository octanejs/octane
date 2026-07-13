import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerToaster } from './_fixtures/server.tsrx';

describe('@octanejs/sonner — server rendering', () => {
	it('renders the accessible empty host without reading browser globals', () => {
		const { html } = renderToString(ServerToaster);
		expect(html).toContain('<h1>Toast host</h1>');
		expect(html).toContain('aria-label="Notifications alt+T"');
		expect(html).toContain('aria-live="polite"');
		expect(html).not.toContain('data-sonner-toaster');
	});
});
