import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { extractCss } from 'goober';
import { createElement } from 'react';
import { renderToString as renderReactToString } from 'react-dom/server';
import * as reactHotToast from 'react-hot-toast';
import toast from '@octanejs/hot-toast';
import { App } from '../_fixtures/app.tsrx';

// Compares the parsed markup: Octane's hydration markers and React's text
// separators are both comments, attribute order is not significant, and
// Octane's server writer ends an inline style with a semicolon.
function normalize(html: string): string {
	return html
		.replace(/<!--.*?-->/g, '')
		.replace(/ style="([^"]*);"/g, ' style="$1"')
		.replace(/<([a-z][\w-]*) ([^>]*)>/g, (_, tag: string, attributes: string) => {
			const sorted = attributes.match(/[\w:-]+(?:="[^"]*")?/g)!.sort();
			return `<${tag} ${sorted.join(' ')}>`;
		});
}

describe('@octanejs/hot-toast — server rendering', () => {
	// @parity-case conformance:hot-toast-server-render
	it('renders queued toasts as react-hot-toast does, without browser globals', () => {
		expect(typeof window).toBe('undefined');
		for (const create of [toast.success, reactHotToast.toast.success]) {
			create('Saved on the server', { id: 'server', duration: Infinity });
		}

		const { html } = renderToString(App, { position: 'bottom-right' });
		const reactHtml = renderReactToString(
			createElement(
				'main',
				null,
				createElement('h1', null, 'Notifications'),
				createElement(reactHotToast.Toaster, { position: 'bottom-right' }),
			),
		);

		expect(html).toContain('role="status"');
		expect(html).toContain('Saved on the server');
		expect(normalize(html)).toBe(normalize(reactHtml));
		// goober collects the server-side rules for the page to inline.
		expect(extractCss()).toMatch(/\.go\d+\{/);
	});
});
