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
		expect(html).toContain('programming model, compiled');
		// Hydration wiring: the data script names the app entry + preHydrate hook,
		// and the template carries the built hydrate script.
		expect(html).toContain('"entry":"/src/app/App.tsrx"');
		expect(html).toContain('"preHydrate":"/src/app/router-client.ts"');
		expect(html).toMatch(/<script type="module"[^>]*src="\/assets\/[^"]+\.js"/);
	});

	it('server-renders an MDX doc through the bundle (Shiki output included)', async () => {
		const { response, html } = await get('/docs/quick-start');
		expect(response.status).toBe(200);
		expect(html).toContain('<h1>Quick start</h1>');
		// Shiki splits code into per-token spans — compare tag-stripped text.
		const text = html.replace(/<[^>]+>/g, '');
		expect(text).toContain('pnpm add octane @octanejs/vite-plugin');
		expect(html).toContain('class="shiki');
	});

	it('server-renders the core APIs document', async () => {
		const { response, html } = await get('/docs/core-apis');
		expect(response.status).toBe(200);
		expect(html).toContain('<h1>Core APIs</h1>');
		const text = html.replace(/<[^>]+>/g, '');
		expect(text).toContain('getState');
		expect(text).toContain('Server and static rendering');
	});

	it('server-renders /benchmarks: table data SSRs, charts are client-mounted shells', async () => {
		const { response, html } = await get('/benchmarks');
		expect(response.status).toBe(200);
		const text = html.replace(/<[^>]+>/g, '');
		expect(text).toContain('Benchmarks');
		expect(text).toContain('Octane vs the field');
		expect(text).toContain('The authoring cliff');
		// The SSR/no-JS content is the data tables — every card ships one with
		// the real checked-in benchmark scores (16 timing cards + one bytes card).
		expect((html.match(/Data table \(score ms/g) ?? []).length).toBe(16);
		expect((html.match(/Data table \(production build bytes\)/g) ?? []).length).toBe(1);
		expect(html).toContain('<th scope="row"');
		// The charts themselves mount client-side (recharts' store populates via
		// layout effects): SSR renders same-height shells, never a chart <svg>
		// (the nav's inline menu icon is the only svg on the page).
		expect((html.match(/bench-plot-shell/g) ?? []).length).toBeGreaterThanOrEqual(17);
		expect(html).not.toContain('recharts-surface');
		expect((html.match(/<svg/g) ?? []).length).toBe(1);
	});

	it('SSRs the not-found page through the catch-all with a real 404', async () => {
		const { response, html } = await get('/definitely/not/a/page');
		expect(response.status).toBe(404);
		expect(html).toContain('Page not found');
	});
});
