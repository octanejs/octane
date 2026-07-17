import { renderToStaticMarkup } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { DeferredEditor } from '../_fixtures/deferred-editor.tsrx';

function stripMarkers(html: string): string {
	return html.replace(/<!--[^>]*-->/g, '');
}

describe('@octanejs/tiptap SSR', () => {
	it('keeps a deferred editor server-safe without touching the DOM', () => {
		expect(typeof document).toBe('undefined');

		const { html, css } = renderToStaticMarkup(DeferredEditor, {});
		const visibleHtml = stripMarkers(html);

		expect(visibleHtml).toBe(
			'<main id="deferred-editor"><output id="deferred-status">deferred</output><output id="deferred-selection">deferred</output></main>',
		);
		expect(visibleHtml).not.toContain('ProseMirror');
		expect(css).toBe('');
	});
});
