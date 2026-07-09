// Dev-SSR → real-browser hydration smoke — the seam every historical website
// breakage lived in (router-parity SSR regression, the 2026-07-08 bare-Symbol()
// slot regression) and the one the jsdom suites can't see: those client-render
// only, while `pnpm dev` server-renders each route with PROD-mode-compiled
// server modules and hydrates with DEV-mode client modules. This spec boots the
// REAL vite dev server, loads every route in headless Chromium, and fails on
// any hydration-mismatch warning or page error; then builds and repeats against
// the production `octane-preview` server (prod output has no mismatch warnings
// — dev-gated — so there the gate is "no errors + routes render + client-side
// nav works").
//
// Runs inside the website vitest project (playwright as a library). Skips
// loudly when Chromium isn't installed — CI installs it (see ci.yml).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const WEBSITE = join(process.cwd(), 'website');
const ROUTES = ['/', '/docs', '/benchmarks', '/playground'];
const DEV_PORT = 5299;
const PREVIEW_PORT = 5300;

// One shared browser; `null` means Chromium isn't available → tests skip.
let chromium: typeof import('playwright').chromium | null = null;
let browser: import('playwright').Browser | null = null;

beforeAll(async () => {
	try {
		({ chromium } = await import('playwright'));
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn(
			'[ssr-hydration.e2e] SKIPPED — Chromium unavailable ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}
}, 60_000);

afterAll(async () => {
	await browser?.close();
});

function waitForHttp(url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const probe = async () => {
			try {
				const res = await fetch(url);
				if (res.status < 500) return resolve();
			} catch {
				// not up yet
			}
			if (Date.now() > deadline) return reject(new Error(`server at ${url} never came up`));
			setTimeout(probe, 250);
		};
		probe();
	});
}

async function stop(child: ChildProcess | undefined): Promise<void> {
	if (!child || child.exitCode !== null) return;
	child.kill('SIGTERM');
	await new Promise((r) => {
		child.once('exit', r);
		setTimeout(r, 3000);
	});
	if (child.exitCode === null) child.kill('SIGKILL');
}

// Load `path`, collecting console errors + page errors; returns the filtered
// error list and the rendered <main> text.
async function loadRoute(base: string, path: string) {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
	await page.goto(base + path, { waitUntil: 'networkidle' });
	await page.waitForTimeout(400); // hydration commit + recovery warnings
	const main = (await page.evaluate(() => document.querySelector('main')?.textContent)) ?? '';
	return { page, errors, main };
}

describe.sequential('website dev-SSR → hydration (real browser)', () => {
	let server: ChildProcess;

	beforeAll(async () => {
		if (!browser) return;
		// Fresh optimize-deps cache → deterministic cold start (the warmup pass
		// below absorbs the one-time "Outdated Optimize Dep" reload).
		rmSync(join(WEBSITE, 'node_modules/.vite'), { recursive: true, force: true });
		server = spawn('pnpm', ['exec', 'vite', '--port', String(DEV_PORT), '--strictPort'], {
			cwd: WEBSITE,
			stdio: 'ignore',
		});
		await waitForHttp(`http://localhost:${DEV_PORT}/`, 60_000);
		// Warmup pass: let vite discover + optimize every route's deps so the
		// assertion pass sees steady-state dev behavior.
		for (const route of ROUTES) {
			const { page } = await loadRoute(`http://localhost:${DEV_PORT}`, route);
			await page.close();
		}
	}, 120_000);

	afterAll(async () => {
		await stop(server);
	});

	it.for(ROUTES)(
		'%s hydrates with no mismatch and no page errors',
		{ timeout: 30_000 },
		async (route, ctx) => {
			if (!browser) return ctx.skip();
			const { page, errors, main } = await loadRoute(`http://localhost:${DEV_PORT}`, route);
			try {
				// Dev-compiled client warns on ANY hydration mismatch (recovery
				// rebuilds silently otherwise) — zero tolerance here.
				const real = errors.filter((e) => !e.includes('Failed to load resource'));
				expect(real).toEqual([]);
				expect(main.length).toBeGreaterThan(0);
			} finally {
				await page.close();
			}
		},
	);
});

describe.sequential('website production build → hydration (octane-preview)', () => {
	let server: ChildProcess;

	beforeAll(async () => {
		if (!browser) return;
		await new Promise<void>((resolve, reject) => {
			const build = spawn('pnpm', ['exec', 'vite', 'build'], { cwd: WEBSITE, stdio: 'ignore' });
			build.once('exit', (code) =>
				code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`)),
			);
		});
		server = spawn('pnpm', ['exec', 'octane-preview', '--port', String(PREVIEW_PORT)], {
			cwd: WEBSITE,
			stdio: 'ignore',
		});
		await waitForHttp(`http://localhost:${PREVIEW_PORT}/`, 30_000);
	}, 180_000);

	afterAll(async () => {
		await stop(server);
	});

	it.for(ROUTES)('%s renders and runs with no errors', { timeout: 30_000 }, async (route, ctx) => {
		if (!browser) return ctx.skip();
		const { page, errors, main } = await loadRoute(`http://localhost:${PREVIEW_PORT}`, route);
		try {
			expect(errors).toEqual([]);
			expect(main.length).toBeGreaterThan(0);
		} finally {
			await page.close();
		}
	});

	it('client-side navigation works after hydration', { timeout: 30_000 }, async (ctx) => {
		if (!browser) return ctx.skip();
		const { page, errors } = await loadRoute(`http://localhost:${PREVIEW_PORT}`, '/');
		try {
			await page.click('a.nav-link[href="/benchmarks"]');
			await page.waitForFunction(() => location.pathname === '/benchmarks', null, {
				timeout: 10_000,
			});
			await page.waitForFunction(
				() => (document.querySelector('main')?.textContent ?? '').includes('Benchmarks'),
				null,
				{ timeout: 10_000 },
			);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});
});
