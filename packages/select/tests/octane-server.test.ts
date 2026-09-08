// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { renderToPipeableStream, renderToStaticMarkup, renderToString } from 'octane/server';

import { createStyleCache, resolveStyle } from './style-adapter.mjs';
import { ServerStyleFixture } from './server-fixture.tsrx';

function expected(color = 'hotpink') {
	return resolveStyle(createStyleCache({ key: 'rs' }), {
		boxSizing: 'border-box',
		color,
		'&:hover': { color: 'rebeccapurple' },
	});
}

function streamFixture(props?: { color?: string }, nonce?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: string[] = [];
		renderToPipeableStream(ServerStyleFixture, props, {
			nonce,
			onShellError: reject,
		}).pipe({
			write(chunk: string) {
				chunks.push(chunk);
			},
			end() {
				resolve(chunks.join(''));
			},
		});
	});
}

describe('React Select U1 Octane style channel', () => {
	it('collects exact Emotion rules and class identity in renderToString', () => {
		const oracle = expected();
		const result = renderToString(ServerStyleFixture, undefined, { nonce: 'octane-csp' });

		expect(result.html).toContain(`class="${oracle.className}"`);
		expect(result.css).toContain(`data-octane="${oracle.id}"`);
		expect(result.css).toContain('nonce="octane-csp"');
		expect(result.css).toContain(oracle.rules);
	});

	it('isolates dynamic rules across repeated server requests', () => {
		const crimson = renderToString(ServerStyleFixture, { color: 'crimson' });
		const royalblue = renderToString(ServerStyleFixture, { color: 'royalblue' });

		expect(crimson.css).toContain('color:crimson');
		expect(crimson.css).not.toContain('color:royalblue');
		expect(royalblue.css).toContain('color:royalblue');
		expect(royalblue.css).not.toContain('color:crimson');
	});

	it('collects the same rule contract in static markup', () => {
		const oracle = expected();
		const result = renderToStaticMarkup(ServerStyleFixture);

		expect(result.html).not.toContain('<!--');
		expect(result.html).toContain(`class="${oracle.className}"`);
		expect(result.css).toContain(oracle.rules);
	});

	it('streams nonce-bearing styles before the element that uses them', async () => {
		const oracle = expected();
		const output = await streamFixture(undefined, 'stream-csp');
		const style = output.indexOf(`<style data-octane="${oracle.id}" nonce="stream-csp">`);
		const element = output.indexOf('id="react-select-u1"');

		expect(style).toBeGreaterThanOrEqual(0);
		expect(element).toBeGreaterThan(style);
		expect(output).toContain(oracle.rules);
	});
});
