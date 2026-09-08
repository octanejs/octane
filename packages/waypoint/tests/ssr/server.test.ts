import { createElement } from 'react';
import { renderToStaticMarkup as renderReact } from 'react-dom/server';
import ReactWaypoint from 'react-waypoint';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerWaypoint } from './_fixtures/server.tsrx';

function visibleMarkup(html: string): string {
	return html.replace(/<!--[^]*?-->/g, '').replace(/;"/g, '"');
}

describe('@octanejs/waypoint server contract', () => {
	// @parity-case ssr:static-markup
	it('matches the pinned React marker markup without touching window', () => {
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		const serverHtml = renderToString(ServerWaypoint).html;
		const octane = visibleMarkup(serverHtml);
		const react = renderReact(
			createElement(
				'main',
				null,
				createElement(ReactWaypoint),
				createElement(ReactWaypoint, null, createElement('div', { id: 'custom' }, 'Marker')),
			),
		);
		expect(octane).toBe(react);
		warning.mockRestore();
	});
});
