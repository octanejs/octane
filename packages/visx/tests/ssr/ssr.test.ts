import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerFamilies, WordcloudFamilies } from '../_fixtures/charts.tsrx';
import { HydrationFixture } from '../_fixtures/hydration.tsrx';
import { SERVER_HTML } from '../hydration/server-html';

function withoutMarkers(html: string): string {
	return html.replace(/<!--[^>]*-->/g, '');
}

describe('@octanejs/visx SSR', () => {
	it('renders fixed primitives, definitions, axes, text, XYChart series, responsive fallback, and wordcloud content', () => {
		expect(typeof document).toBe('undefined');
		const { html, css } = renderToString(ServerFamilies, {});
		const flat = withoutMarkers(html);

		expect(flat).toContain('<main id="visx-server-fixture">');
		expect(flat).toContain('<linearGradient id="fixture-gradient"');
		expect(flat).toContain('<clipPath id="fixture-clip"');
		expect(flat).toContain('<pattern id="fixture-pattern"');
		expect(flat).toContain('<marker id="fixture-arrow"');
		expect(flat).toContain('Deterministic');
		expect(flat).toContain('SVG text');
		expect(flat).toContain('Peak');
		expect(flat).toContain('xy chart fixture');
		expect(flat).toContain('wrapped xy chart fixture');
		expect(flat).toContain('fill="#51cf66"');
		expect(flat).toContain('stroke="#e03131"');
		expect(flat).toContain('class="vx-bar-series"');
		expect(flat).toContain('class="visx-line"');
		expect(flat.match(/visx-split-fixture/g) ?? []).toHaveLength(2);
		expect(flat).toContain('alpha');
		expect(flat).toContain('width="240" height="120"');
		expect(flat).toContain('octane');
		expect(flat).toContain('visx');
		expect(flat).toContain('Portal waits for the browser');
		expect(flat).not.toContain('client overlay');
		expect(flat.match(/<path/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
		expect(flat.match(/<rect/g)?.length ?? 0).toBeGreaterThan(5);
		expect(css).toBe('');
	});

	it('generates stable sanitized ids when definition ids are omitted', () => {
		const first = renderToString(ServerFamilies, {}).html;
		const second = renderToString(ServerFamilies, {}).html;
		expect(second).toBe(first);
		expect(first).not.toMatch(/id="[^"]*:[^"]*"/);
	});

	it('server-renders a deterministic placed wordcloud instead of an empty shell', () => {
		const first = renderToString(WordcloudFamilies).html;
		const second = renderToString(WordcloudFamilies).html;
		const positions = [...first.matchAll(/<text[^>]* x="([^"]+)"[^>]* y="([^"]+)"/g)].map(
			([, x, y]) => `${x},${y}`,
		);

		expect(second).toBe(first);
		expect(first).toContain('<svg width="320" height="180"');
		expect(positions).toHaveLength(3);
		expect(new Set(positions).size).toBe(3);
	});

	it('renders the hydration fixture as complete deterministic SVG', () => {
		const first = renderToString(HydrationFixture).html;
		const second = renderToString(HydrationFixture).html;
		expect(second).toBe(first);
		expect(first).toBe(SERVER_HTML);
		expect(first).toContain('id="visx-hydration-svg"');
		expect(first).toContain('aria-label="hydration xy chart"');
		expect(first).toContain('Hydration text');
		expect(first).toContain('class="vx-bar-series"');
		const generatedIds = [
			...first.matchAll(/id="(visx-(?:gradient|clip|pattern|marker)-[^"]+)"/g),
		].map((match) => match[1]);
		expect(generatedIds).toHaveLength(4);
		expect(generatedIds.every((id) => !id.includes(':'))).toBe(true);
	});
});
