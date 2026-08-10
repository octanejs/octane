import { renderToStaticMarkup } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { ServerFixture } from '../_fixtures/server.tsrx';

describe('@octanejs/zag SSR', () => {
	it('renders the initial machine snapshot and portal children without a DOM', () => {
		expect(typeof document).toBe('undefined');
		const { html, css } = renderToStaticMarkup(ServerFixture);

		expect(html).toBe('<p id="server-machine">idle/0</p>');
		expect(css).toBe('');
	});
});
