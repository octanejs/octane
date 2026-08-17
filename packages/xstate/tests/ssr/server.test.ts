import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { ServerView } from '../_fixtures/server.tsrx';

describe('@octanejs/xstate SSR', () => {
	it('renders machine and contextual snapshots without a DOM', () => {
		expect(typeof document).toBe('undefined');
		const { html, css } = renderToStaticMarkup(ServerView);
		expect(html).toBe('<p id="server-value">7</p><span id="context-count">context=7</span>');
		expect(css).toBe('');
	});
});
