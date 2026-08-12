// Server rendering framework contracts: immutable chunk ids, per-request
// isolation, and streaming order. Documented SSR adaptations live in
// adapted-divergences.test.ts.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';
import { renderToPipeableStream, renderToString } from 'octane/server';

import { createGlobalStyle } from '@octanejs/styled-components';
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
});
