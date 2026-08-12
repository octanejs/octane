// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { ServerVirtualList } from '../_fixtures/server.tsrx';

describe('@octanejs/tanstack-virtual SSR', () => {
	it('renders the initial offset window without a DOM', () => {
		expect(typeof document).toBe('undefined');
		const { html, css } = renderToStaticMarkup(ServerVirtualList, {});
		expect(html).toBe('<p id="server-range">2,3,4/400</p>');
		expect(css).toBe('');
	});
});
