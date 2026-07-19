// @vitest-environment node
//
// Production SSR smoke test — runs the real TanStack Start + Nitro build and
// drives the generated server over HTTP. Complements smoke.test.ts
// (client-side render): this proves the deployable artifact serves every route
// server-side.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { FRAMEWORK_CARDS, OCTANE_CARDS } from '../src/content/benchmarks.ts';

const websiteRoot = fileURLToPath(new URL('..', import.meta.url));
const serverEntry = path.join(websiteRoot, '.output/server/index.mjs');

let server: ChildProcess;
let origin: string;

async function get(url: string) {
	const response = await fetch(origin + url);
	return { response, html: await response.text() };
}

async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const socket = createServer();
		socket.once('error', reject);
		socket.listen(0, '127.0.0.1', () => {
			const { port } = socket.address() as import('node:net').AddressInfo;
			socket.close(() => resolve(port));
		});
	});
}

async function waitForServer(child: ChildProcess, url: string): Promise<void> {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`Nitro server exited with code ${child.exitCode} before listening`);
		}
		try {
			const response = await fetch(url);
			if (response.status < 500) {
				await response.body?.cancel();
				return;
			}
		} catch {
			// Server is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Nitro server at ${url} never came up`);
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

beforeAll(async () => {
	await new Promise<void>((resolve, reject) => {
		const build = spawn('pnpm', ['exec', 'vite', 'build'], {
			cwd: websiteRoot,
			stdio: 'ignore',
			env: { ...process.env, NODE_ENV: 'production', NITRO_PRESET: 'node-server' },
		});
		build.once('error', reject);
		build.once('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`vite build exited with code ${code}`));
		});
	});
	const port = await getFreePort();
	origin = `http://127.0.0.1:${port}`;
	server = spawn(process.execPath, [serverEntry], {
		cwd: websiteRoot,
		stdio: 'ignore',
		env: {
			...process.env,
			NODE_ENV: 'production',
			HOST: '127.0.0.1',
			PORT: String(port),
		},
	});
	await waitForServer(server, origin + '/');
}, 240_000);

afterAll(async () => {
	if (!server || server.exitCode !== null) return;
	server.kill('SIGTERM');
	await new Promise((resolve) => {
		server.once('exit', resolve);
		setTimeout(resolve, 3000);
	});
	if (server.exitCode === null) server.kill('SIGKILL');
});

describe('built Start server', () => {
	it('produced Nitro server and public asset output', () => {
		expect(fs.existsSync(serverEntry)).toBe(true);
		expect(fs.existsSync(path.join(websiteRoot, '.output/public/playground-runtime.mjs'))).toBe(
			true,
		);
	});

	it('server-renders the home page with the hydration payload', async () => {
		const { response, html } = await get('/');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toMatch(/^text\/html\b/);
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
		const publicRoot = path.join(websiteRoot, '.output/public');
		const initialAssetPaths = Array.from(
			new Set(
				Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.js)(?:\?[^" ]*)?"/g)).map(
					(match) => match[1]!,
				),
			),
		);
		expect(initialAssetPaths.length).toBeGreaterThan(0);

		const initialJavaScript = initialAssetPaths
			.map((assetPath) => fs.readFileSync(path.join(publicRoot, assetPath.slice(1)), 'utf8'))
			.join('\n');
		const allJavaScript = readJavaScriptFiles(path.join(publicRoot, 'assets')).join('\n');
		const routeOnlySentinels = [
			'This link contains shared code.',
			'Every suite at a glance',
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

	it('server-renders the Core APIs guide, TOC, and live-example shell', async () => {
		const { response, html } = await get('/docs/core-apis');
		expect(response.status).toBe(200);
		expect(classCount(html, 'doc-hero')).toBeGreaterThan(0);
		expect(classCount(html, 'on-this-page')).toBeGreaterThan(0);
		expect(classCount(html, 'demo')).toBeGreaterThan(0);
		expect(classCount(html, 'shiki')).toBeGreaterThan(0);
		expect(html).toContain('id="deferred-hydration"');
		expect(html).toContain('Deferred hydration');
	});

	// This route deliberately renders every chart and accessible data table; give
	// that full integration path headroom beyond the generic unit-test timeout on
	// slower CI runners.
	it('server-renders /benchmarks with complete bar charts and table data', async () => {
		const { response, html } = await get('/benchmarks');
		const cards = [...FRAMEWORK_CARDS, ...OCTANE_CARDS];
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
