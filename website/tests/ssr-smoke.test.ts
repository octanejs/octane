// @vitest-environment node
//
// Production SSR smoke test — runs the REAL `vite build` (client + server
// bundles via @octanejs/vite-plugin) and drives the built dist/server handler
// directly: the same export the Vercel adapter's function wraps and
// `octane-preview` boots locally. Complements smoke.test.ts (client-side
// render): this proves the DEPLOYED artifact serves every route server-side.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const websiteRoot = fileURLToPath(new URL('..', import.meta.url));
const serverEntry = path.join(websiteRoot, 'dist/server/entry.js');

let handler: (request: Request) => Promise<Response>;

async function get(url: string) {
	const response = await handler(new Request(`http://localhost${url}`));
	return { response, html: await response.text() };
}

function classCount(html: string, className: string): number {
	return Array.from(html.matchAll(/class="([^"]*)"/g)).filter((match) =>
		match[1]?.split(/\s+/).includes(className),
	).length;
}

beforeAll(async () => {
	await build({ root: websiteRoot, logLevel: 'silent' });
	({ handler } = await import(pathToFileURL(serverEntry).href));
}, 240_000);

describe('built SSR handler', () => {
	it('produced the deployable layout (assets static, template with the server)', () => {
		expect(fs.existsSync(serverEntry)).toBe(true);
		expect(fs.existsSync(path.join(websiteRoot, 'dist/server/index.html'))).toBe(true);
		// index.html must NOT be a static file — it would shadow SSR at '/'.
		expect(fs.existsSync(path.join(websiteRoot, 'dist/client/index.html'))).toBe(false);
	});

	it('ran the Vercel adapter (adapter: vercel() in octane.config → .vercel/output)', () => {
		// The closeBundle → adapter.adapt() wiring: the build above must have
		// emitted Build Output API v3 alongside dist/.
		const outputDir = path.join(websiteRoot, '.vercel/output');
		expect(fs.existsSync(path.join(outputDir, 'functions/index.func/entry.js'))).toBe(true);
		const config = JSON.parse(fs.readFileSync(path.join(outputDir, 'config.json'), 'utf-8'));
		expect(config.routes).toContainEqual({ handle: 'filesystem' });
	});

	it('server-renders the home page with the hydration payload', async () => {
		const { response, html } = await get('/');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(html).toContain('<main');
		expect(classCount(html, 'home')).toBeGreaterThan(0);
		// The home benchmark explorer server-renders its accessible fallback data
		// table (the interactive bar chart + heatmap swap in on mount); no client-only
		// chart shell or charting-library markup is emitted server-side, so no-JS and
		// crawlers still get every number.
		expect(classCount(html, 'bx-fallback-table')).toBe(1);
		expect(classCount(html, 'visx-bar')).toBe(0);
		expect(classCount(html, 'home-bench-chart')).toBe(0);
		expect(classCount(html, 'deferred-bench')).toBe(0);
		expect(classCount(html, 'bench-plot-shell')).toBe(0);
		// Hydration wiring: the data script names the app entry + preHydrate hook,
		// and the template carries the built hydrate script.
		expect(html).toContain('"entry":"/src/app/App.tsrx"');
		expect(html).toContain('"preHydrate":"/src/app/router-client.ts"');
		expect(html).toMatch(
			/<script(?=[^>]*\bdata-octane-hydrate\b)(?=[^>]*\btype="module")(?=[^>]*\bsrc="\/assets\/[^"]+\.js")[^>]*>/,
		);
	});

	it('server-renders an MDX doc through the bundle (Shiki output included)', async () => {
		const { response, html } = await get('/docs/quick-start');
		expect(response.status).toBe(200);
		expect(html).toContain('<article');
		expect(html).toContain('<h1>');
		expect(classCount(html, 'prose')).toBeGreaterThan(0);
		expect(classCount(html, 'shiki')).toBeGreaterThan(0);
	});

	it('server-renders the Core APIs guide, TOC, and live-example shell', async () => {
		const { response, html } = await get('/docs/core-apis');
		expect(response.status).toBe(200);
		expect(classCount(html, 'doc-hero')).toBeGreaterThan(0);
		expect(classCount(html, 'on-this-page')).toBeGreaterThan(0);
		expect(classCount(html, 'demo')).toBeGreaterThan(0);
		expect(classCount(html, 'shiki')).toBeGreaterThan(0);
	});

	it('server-renders /benchmarks: table data SSRs, charts are client-mounted shells', async () => {
		const { response, html } = await get('/benchmarks');
		expect(response.status).toBe(200);
		expect(classCount(html, 'benchpage')).toBeGreaterThan(0);
		expect(html).toContain('aria-labelledby="bench-frameworks"');
		expect(html).toContain('aria-labelledby="bench-internal"');
		// Every no-JS benchmark card ships an accessible data table.
		expect(classCount(html, 'bench-card')).toBeGreaterThan(0);
		expect(html).toContain('<th scope="row"');
		expect(classCount(html, 'bench-table')).toBeGreaterThan(0);
		// Recharts populates in layout effects, so SSR emits chart shells.
		expect(html).toContain('bench-plot-shell');
		expect(html).not.toContain('recharts-surface');
	});

	it('SSRs the not-found page through the catch-all with a real 404', async () => {
		const { response, html } = await get('/definitely/not/a/page');
		expect(response.status).toBe(404);
		expect(classCount(html, 'notfound')).toBeGreaterThan(0);
		expect(classCount(html, 'notfound-home')).toBeGreaterThan(0);
	});
});
