import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerFixture } from './_fixtures/server.tsrx';

function stripMarkers(html: string): string {
	return html.replace(/<!--[^>]*-->/g, '');
}

describe('@octanejs/react-draggable SSR', () => {
	// @parity-case adapted:react-draggable-ssr
	it('renders deterministic HTML, SVG, and core children without browser globals', () => {
		expect(typeof document).toBe('undefined');
		const first = renderToString(ServerFixture, {});
		const second = renderToString(ServerFixture, {});
		expect(second).toEqual(first);
		const html = stripMarkers(first.html);
		expect(html.match(/id="html-drag"/g)).toHaveLength(1);
		expect(html.match(/id="svg-drag"/g)).toHaveLength(1);
		expect(html.match(/id="core-drag"/g)).toHaveLength(1);
		expect(html.match(/id="html-drag"[^>]*class=/g)).toHaveLength(1);
		expect(html).toContain('class="authored react-draggable"');
		expect(html).toContain('translate(3px,4px)');
		// SVG selection is deliberately mount-time: SSR cannot inspect a DOM node.
		expect(html).toContain('translate(5px,6px)');
		expect(first.css).toBe('');
	});
});
