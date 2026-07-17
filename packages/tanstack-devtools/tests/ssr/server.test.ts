import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { ServerDevtools } from '../_fixtures/server.tsrx';

describe('@octanejs/tanstack-devtools SSR', () => {
	it('renders its anchor element without a DOM and never mounts the core', () => {
		expect(typeof document).toBe('undefined');

		const { html, css } = renderToStaticMarkup(ServerDevtools);

		// Only the absolutely-positioned anchor renders on the server; plugin/title/
		// trigger portals require the client-only mount effect, which never runs here.
		expect(html).toMatch(/^<div[^>]*><\/div>$/);
		expect(html).toContain('position');
		expect(css).toBe('');
	});
});
