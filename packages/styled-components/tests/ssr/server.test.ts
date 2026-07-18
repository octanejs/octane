// Server rendering through octane's automatic css channel: renderToString
// returns { html, css } with one immutable chunk tag per (componentId, name),
// per-request isolation, and the ServerStyleSheet compat surface.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';
import { renderToPipeableStream, renderToString } from 'octane/server';

import { createGlobalStyle, ServerStyleSheet } from '@octanejs/styled-components';
import { ServerApp } from './_fixtures/server-app.tsrx';

const RequestGlobal = createGlobalStyle<{ tone: string }>`
	body {
		color: ${(props) => props.tone};
	}
`;

function RequestApp(props: { tone: string }) {
	return createElement(RequestGlobal, props);
}

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

	it('emits identical, immutable chunk ids across repeated renders (per-request isolation)', () => {
		const first = renderToString(ServerApp);
		const second = renderToString(ServerApp);
		// The stateless server output re-emits the complete CSS into each active
		// request — byte-identical, ids included.
		expect(second.css).toBe(first.css);
		expect(chunkIds(second.css)).toEqual(chunkIds(first.css));
	});

	it('isolates dynamic global styles between requests', () => {
		const red = renderToString(RequestApp, { tone: 'crimson' });
		const blue = renderToString(RequestApp, { tone: 'royalblue' });

		expect(red.css).toContain('color:crimson');
		expect(red.css).not.toContain('color:royalblue');
		expect(blue.css).toContain('color:royalblue');
		expect(blue.css).not.toContain('color:crimson');
	});

	it('streams chunk tags ahead of the shell html', async () => {
		const chunks: string[] = [];
		await new Promise<void>((resolve) => {
			renderToPipeableStream(ServerApp).pipe({
				write(chunk: string) {
					chunks.push(chunk);
				},
				end() {
					resolve();
				},
			});
		});
		const out = chunks.join('');
		// styles precede the shell body so painted fallbacks are already styled
		const firstChunkTag = out.indexOf('data-octane="sc.');
		const heroPos = out.indexOf('id="hero"');
		expect(firstChunkTag).toBeGreaterThanOrEqual(0);
		expect(heroPos).toBeGreaterThan(firstChunkTag);
		expect(out).toContain('color:tomato');
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
