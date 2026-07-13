import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerFixture } from './_fixtures/server.tsrx';

function stripMarkers(html: string): string {
	return html.replace(/<!--[^>]*-->/g, '');
}

describe('@octanejs/dnd-kit SSR', () => {
	it('renders provider, draggable, droppable, sortable, and inactive overlay without a DOM', () => {
		expect(typeof document).toBe('undefined');
		const { html, css } = renderToString(ServerFixture, {});
		const flat = stripMarkers(html);
		expect(flat).toContain('<main id="server-dnd">');
		expect(flat).toContain('<button id="server-drag">server card</button>');
		expect(flat).toContain('<div id="server-drop">server target</div>');
		expect(flat).toContain('<div id="server-sort">server sortable</div>');
		expect(flat).toContain('<div data-dnd-overlay="true"></div>');
		expect(flat.match(/id="server-dnd"/g)).toHaveLength(1);
		expect(flat).not.toContain('server-overlay');
		expect(css).toBe('');
	});
});
