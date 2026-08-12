import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { ServerDrawerFixture } from '../_fixtures/drawer.tsrx';

describe('vaul v1.1.2 server rendering', () => {
	// @parity-case ssr:closed-trigger
	it('renders a closed drawer trigger without browser globals', () => {
		const html = renderToString(ServerDrawerFixture).html;
		expect(html).toContain('Open drawer');
		expect(html).not.toContain('data-vaul-drawer');
	});
});
