// @vitest-environment node
//
// Production SSR smoke test — drives the real TanStack Start + Nitro build over
// HTTP. Complements smoke.test.ts (client-side render): this proves the built
// artifact serves every route server-side.
//
// The build and the server it talks to belong to the project's globalSetup
// (tests/setup/production-server.ts), which produces them once for every
// server-backed spec. This file used to run a second, `node-server`-preset build
// of its own purely to obtain an HTTP origin; the assertions below are all
// markup- and asset-level, so they hold against either preset's output. See the
// setup file for the coverage that consolidating on `vercel` gave up.
import { beforeAll, describe, it, expect, inject } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { waitForReadyState } from './support/server-process.ts';
import {
	FRAMEWORK_CARDS,
	LYNX_CARDS,
	OCTANE_CARDS,
	TARGET_CARDS,
} from '../src/content/benchmarks.ts';
import { BINDING_CATEGORIES } from '../src/content/bindings.ts';
import ecosystemIndex from '../src/content/ecosystem-index.json';
import type { EcosystemEntity } from '../src/lib/ecosystem-search-core.ts';
import { ecosystemPackageGuideHref } from '../src/lib/ecosystem-presentation.ts';

const origin = inject('productionOrigin');
const outputDir = inject('productionOutputDir');

// The setup starts the build in the background so the rest of the suite does
// not queue behind it, so the origin is reserved but not yet answering when this
// module loads. Everything below — HTTP and build-output alike — needs the build
// finished, so wait once here rather than per case.
beforeAll(() => waitForReadyState(inject('productionReadyFile'), 460_000));
const staticRoot = path.join(outputDir, 'static');
const serverEntry = path.join(outputDir, 'functions/__server.func/index.mjs');

async function get(url: string) {
	const response = await fetch(origin + url);
	return { response, html: await response.text() };
}

function classCount(html: string, className: string): number {
	return Array.from(html.matchAll(/class="([^"]*)"/g)).filter((match) =>
		match[1]?.split(/\s+/).includes(className),
	).length;
}

function readJavaScriptFiles(root: string): string[] {
	return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) return readJavaScriptFiles(entryPath);
		return entry.name.endsWith('.js') ? [fs.readFileSync(entryPath, 'utf8')] : [];
	});
}

describe('built Start server', () => {
	it('produced Nitro server and public asset output', () => {
		expect(fs.existsSync(serverEntry)).toBe(true);
		expect(fs.existsSync(path.join(staticRoot, 'playground-runtime.json'))).toBe(true);
	});

	it('serves the documented shadcn registry paths', async () => {
		for (const registryPath of [
			'/r/button.json',
			'/r/styles/base-nova/button.json',
			'/r/styles/radix-nova/button.json',
			'/r/styles/aria-nova/button.json',
		]) {
			const { response, html } = await get(registryPath);
			expect(response.status, registryPath).toBe(200);
			expect(response.headers.get('content-type'), registryPath).toMatch(/^application\/json\b/);
			expect(JSON.parse(html), registryPath).toMatchObject({
				name: 'button',
				type: 'registry:ui',
			});
		}
	});

	it('server-renders the home page with the hydration payload', async () => {
		const { response, html } = await get('/');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toMatch(/^text\/html\b/);
		const websiteData = Array.from(
			html.matchAll(/<script(?=[^>]*\btype="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g),
		)
			.map((match) => JSON.parse(match[1]!))
			.find((data) => data['@type'] === 'WebSite');
		expect(websiteData).toEqual({
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name: 'Octane',
			alternateName: ['OctaneJS', 'octanejs.dev'],
			url: 'https://octanejs.dev/',
		});
		expect(html).toContain('<main');
		expect(classCount(html, 'home')).toBeGreaterThan(0);
		// The complete explorer is deterministic server markup: no-JS, hydration,
		// crawlers, and the interactive client all start from the same geometry.
		expect(classCount(html, 'bx-fallback-table')).toBe(0);
		expect(classCount(html, 'bx-plot')).toBe(1);
		expect(classCount(html, 'bx-heat')).toBe(1);
		expect(classCount(html, 'visx-bar')).toBe(0);
		expect(classCount(html, 'home-bench-chart')).toBe(0);
		expect(classCount(html, 'deferred-bench')).toBe(0);
		expect(classCount(html, 'bench-plot-shell')).toBe(0);
		expect(html).toContain('<html lang="en"');
		expect(html).toContain('id="__app"');
		for (const href of [
			'/favicon.ico',
			'/favicon.svg',
			'/apple-touch-icon.png',
			'/site.webmanifest',
		]) {
			expect(html).toContain(`href="${href}"`);
		}
		expect(html).toMatch(/<script(?=[^>]*\btype="module")[^>]*>/);
	});

	it('keeps route-only components out of the home-page asset graph', async () => {
		const { html } = await get('/');
		const initialAssetPaths = Array.from(
			new Set(
				Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.js)(?:\?[^" ]*)?"/g)).map(
					(match) => match[1]!,
				),
			),
		);
		expect(initialAssetPaths.length).toBeGreaterThan(0);

		const initialJavaScript = initialAssetPaths
			.map((assetPath) => fs.readFileSync(path.join(staticRoot, assetPath.slice(1)), 'utf8'))
			.join('\n');
		const allJavaScript = readJavaScriptFiles(path.join(staticRoot, 'assets')).join('\n');
		const routeOnlySentinels = [
			'This link contains shared code.',
			'Octane vs the field',
			'Configure Vite, Rspack, or Rsbuild for Octane apps.',
			'Objects are not valid as an Octane child (found: %s).',
		];

		for (const sentinel of routeOnlySentinels) {
			expect(allJavaScript).toContain(sentinel);
			expect(initialJavaScript).not.toContain(sentinel);
		}
	});

	it('server-renders an MDX doc through the bundle (Shiki output included)', async () => {
		const { response, html } = await get('/docs/quick-start');
		expect(response.status).toBe(200);
		expect(html).toContain('<article');
		expect(html).toContain('<h1>');
		expect(classCount(html, 'prose')).toBeGreaterThan(0);
		expect(classCount(html, 'shiki')).toBeGreaterThan(0);
	});

	it('server-renders the complete ecosystem directory without JavaScript', async () => {
		const { response, html } = await get('/docs/bindings');
		const entities = ecosystemIndex as EcosystemEntity[];
		const bindingsByPackage = new Map(
			entities
				.filter((entity) => entity.kind === 'library-binding')
				.map((entity) => [entity.packageName, entity]),
		);
		const orderedEntities = [
			...entities.filter((entity) => entity.kind === 'framework-integration'),
			...BINDING_CATEGORIES.flatMap((category) =>
				[...category.packages]
					.sort((left, right) => left.title.localeCompare(right.title))
					.map(({ packageName }) => bindingsByPackage.get(packageName)!),
			),
		];
		expect(response.status).toBe(200);
		expect(classCount(html, 'ecosystem-entity')).toBe(entities.length);
		expect(orderedEntities).toHaveLength(entities.length);

		let previousPosition = -1;
		for (const entity of orderedEntities) {
			const position = html.indexOf(`id="${entity.id}"`);
			expect(position, entity.id).toBeGreaterThan(previousPosition);
			previousPosition = position;
			expect(html, entity.packageName).toContain(
				`href="${ecosystemPackageGuideHref(entity.packageName)}"`,
			);
		}
	});

	it('server-renders a filtered ecosystem result from its shareable URL', async () => {
		const { response, html } = await get('/docs/bindings?q=TanStack%20Router&kind=binding');
		expect(response.status).toBe(200);
		expect(classCount(html, 'ecosystem-directory')).toBe(1);
		expect(html).toContain('for “TanStack Router”');
		expect(html).not.toContain('id="ecosystem-search"');
		expect(html).toContain('id="binding-tanstack-router"');
		expect(html).toContain('id="binding-tanstack-router-ssr-query"');
		expect(html.indexOf('id="binding-tanstack-router"')).toBeLessThan(
			html.indexOf('id="binding-tanstack-router-ssr-query"'),
		);
		expect(html).not.toContain('id="integration-tanstack-start"');
	});

	it('server-renders the Core APIs guide, TOC, and live-example shell', async () => {
		const { response, html } = await get('/docs/core-apis');
		expect(response.status).toBe(200);
		expect(classCount(html, 'doc-hero')).toBeGreaterThan(0);
		expect(classCount(html, 'on-this-page')).toBeGreaterThan(0);
		expect(classCount(html, 'demo')).toBeGreaterThan(0);
		expect(classCount(html, 'shiki')).toBeGreaterThan(0);
		expect(html).toContain('id="deferred-hydration"');
		expect(html).toContain('Deferred hydration');
		expect(html).toContain('id="behavior-only-roots"');
		expect(html).toContain('Behavior-only roots and external ownership');
		expect(html).toContain('attachBehaviorRoot');
		expect(html).toContain('octane/behavior');
	});

	// This route deliberately renders every chart and accessible data table; give
	// that full integration path headroom beyond the generic unit-test timeout on
	// slower CI runners.
	it('server-renders /benchmarks with complete bar charts and table data', async () => {
		const { response, html } = await get('/benchmarks');
		const cards = [...FRAMEWORK_CARDS, ...TARGET_CARDS, ...LYNX_CARDS, ...OCTANE_CARDS];
		// Each card server-renders its default "overall" view: one geomean bar per
		// series with a computable ratio vs the reference (rows where either side
		// is missing or zero drop out); single-series cards chart every operation.
		const expectedBars = cards.reduce((total, card) => {
			if (card.series.length === 1) {
				return (
					total + card.rows.filter((row) => typeof row[card.series[0].key] === 'number').length
				);
			}
			const reference = card.series[0];
			return (
				total +
				card.series.filter((series) =>
					card.rows.some(
						(row) =>
							typeof row[reference.key] === 'number' &&
							(row[reference.key] as number) > 0 &&
							typeof row[series.key] === 'number' &&
							(row[series.key] as number) > 0,
					),
				).length
			);
		}, 0);
		expect(response.status).toBe(200);
		expect(classCount(html, 'benchpage')).toBeGreaterThan(0);
		expect(html).toContain('aria-labelledby="bench-frameworks"');
		expect(html).toContain('aria-labelledby="bench-targets"');
		expect(html).toContain('aria-labelledby="bench-lynx"');
		expect(html).toContain('aria-labelledby="bench-internal"');
		// Every no-JS benchmark card ships both the real chart and its accessible table.
		expect(classCount(html, 'bench-card')).toBe(cards.length);
		expect(classCount(html, 'bench-fill')).toBe(expectedBars);
		expect(html).toContain('<th scope="row"');
		expect(classCount(html, 'bench-table')).toBe(cards.length);
		expect(classCount(html, 'bench-plot-shell')).toBe(0);
		expect(classCount(html, 'recharts-wrapper')).toBe(0);
	}, 15_000);

	it('SSRs the not-found page through the catch-all with a real 404', async () => {
		const { response, html } = await get('/definitely/not/a/page');
		expect(response.status).toBe(404);
		expect(classCount(html, 'notfound')).toBeGreaterThan(0);
		expect(classCount(html, 'notfound-home')).toBeGreaterThan(0);
	});

	it('decodes known errors as escaped text and returns a real 404 for unknown codes', async () => {
		const argument = '<strong>diagnostic value</strong>';
		const known = await get('/errors/3?args%5B%5D=' + encodeURIComponent(argument));
		expect(known.response.status).toBe(200);
		expect(classCount(known.html, 'error-decoder')).toBeGreaterThan(0);
		expect(known.html).toContain('&lt;strong&gt;diagnostic value&lt;/strong&gt;');
		expect(known.html).not.toContain('<strong>diagnostic value</strong>');

		const unknown = await get('/errors/999999');
		expect(unknown.response.status).toBe(404);
		expect(classCount(unknown.html, 'notfound')).toBeGreaterThan(0);
	});
});
