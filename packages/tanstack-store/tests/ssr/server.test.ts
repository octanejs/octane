import { describe, expect, it } from 'vitest';
import { createAtom, createStore } from '@octanejs/tanstack-store';
import { renderToStaticMarkup } from 'octane/server';
import { ServerView } from '../_fixtures/server.tsrx';

describe('@octanejs/tanstack-store SSR', () => {
	it('reads store, atom, and contextual snapshots without a DOM', () => {
		expect(typeof document).toBe('undefined');
		const store = createStore({ count: 7 });
		const atom = createAtom(11);

		const { html, css } = renderToStaticMarkup(ServerView, { store, atom });

		expect(html).toBe('<p id="server-values">7/11</p><span id="context-count">context=7</span>');
		expect(css).toBe('');
	});
});
