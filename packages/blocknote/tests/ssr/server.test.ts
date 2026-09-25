import { renderToStaticMarkup } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { SsrEditor } from '../_fixtures/ssr-editor.tsrx';

describe('@octanejs/blocknote SSR', () => {
	it('renders the view shell in Node without a DOM', () => {
		expect(typeof document).toBe('undefined');
		expect(typeof window).toBe('undefined');

		const { html } = renderToStaticMarkup(SsrEditor, { text: 'Server text' });

		// The editor mounts on the client, so the server emits only the shell.
		// Without a media query the scheme is the "light" fallback.
		expect(html.replace(/<!--[^>]*-->/g, '')).toBe(
			'<main id="ssr-editor"><div class="bn-root bn-container light" data-color-scheme="light">' +
				'<div aria-autocomplete="list" aria-haspopup="listbox"></div></div></main>',
		);
	});
});
