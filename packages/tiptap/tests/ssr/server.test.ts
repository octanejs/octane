import { renderToStaticMarkup } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { DeferredEditor } from '../_fixtures/deferred-editor.tsrx';
import { StaticCustomViews } from '../_fixtures/static-custom-views.tsrx';
import { ServerMenus } from '../_fixtures/menus.tsrx';

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

	it('leaves client-owned menu portal targets out of server output', () => {
		expect(typeof document).toBe('undefined');

		const { html, css } = renderToStaticMarkup(ServerMenus, {});

		expect(stripMarkers(html)).toBe('<main id="server-menus"><output>server-safe</output></main>');
		expect(html).not.toContain('bubble');
		expect(html).not.toContain('floating');
		expect(css).toBe('');
	});

	it('renders static node and mark view content without constructing a DOM renderer', () => {
		expect(typeof document).toBe('undefined');

		const { html, css } = renderToStaticMarkup(StaticCustomViews, {});
		const visibleHtml = stripMarkers(html);

		expect(visibleHtml).toContain('data-node-view-wrapper');
		expect(visibleHtml).toContain('data-node-view-content');
		expect(visibleHtml).toContain('data-static-node-content="true">Static node content</strong>');
		expect(visibleHtml).toContain('data-mark-view-content');
		expect(visibleHtml).toContain('data-static-mark-content="true"');
		expect(visibleHtml).toContain('Static mark content');
		expect(visibleHtml).not.toContain(' as="');
		expect(css).toBe('');
	});
});
