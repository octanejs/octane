// Exact executable evidence for documented SSR adaptations.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';
import { renderToString } from 'octane/server';

import { ServerStyleSheet } from '@octanejs/styled-components';
import { ServerApp } from './_fixtures/server-app.tsrx';

function chunkIds(css: string): string[] {
	return Array.from(css.matchAll(/data-octane="(sc\.[^"]+)"/g), (m) => m[1]);
}

describe('@octanejs/styled-components — server rendering', () => {
	it('collects styled/keyframes/global css into RenderResult.css with zero config', () => {
		const { html, css } = renderToString(ServerApp);

		expect(html).toContain('id="hero"');
		expect(css).toContain('color:tomato');
		expect(css).toContain('padding:4px');
		expect(css).toContain('@keyframes');
		expect(css).toContain('margin:0');

		const ids = chunkIds(css);
		expect(ids.length).toBeGreaterThanOrEqual(4);
		expect(ids.some((id) => id.startsWith('sc.sc-keyframes-'))).toBe(true);
		expect(ids.some((id) => id.startsWith('sc.sc-global-'))).toBe(true);

		// The generated class in a chunk id must appear on the rendered element.
		const heroChunk = ids.find((id) => {
			const name = id.split('.')[2];
			return name && html.includes(name);
		});
		expect(heroChunk).toBeTruthy();
	});

	it('ServerStyleSheet compat: collectStyles + getStyleTags/getStyleElement still work', () => {
		const sheet = new ServerStyleSheet();
		const { html, css } = renderToString(() =>
			sheet.collectStyles(createElement(ServerApp as any, {})),
		);
		expect(html).toContain('id="hero"');
		// Compatibility capture composes with Octane's automatic request channel.
		expect(css).toContain('color:tomato');

		const tags = sheet.getStyleTags();
		expect(tags).toContain('<style ');
		expect(tags).toContain('data-styled="true"');
		expect(tags).toContain('color:tomato');
		// upstream rehydration group trailer format
		expect(tags).toContain('data-styled.g');

		const elements = sheet.getStyleElement();
		expect(elements).toHaveLength(1);
		expect((elements[0] as any).props.dangerouslySetInnerHTML.__html).toContain('color:tomato');
	});

	it('throws the documented seal/stream errors', () => {
		const sheet = new ServerStyleSheet();
		sheet.seal();
		expect(() => sheet.getStyleTags()).toThrow(/collect styles/i);
		expect(() => sheet.collectStyles(null)).toThrow(/collect styles/i);

		const fresh = new ServerStyleSheet();
		expect(() => fresh.interleaveWithNodeStream(null as any)).toThrow(/Streaming/i);
	});
});
