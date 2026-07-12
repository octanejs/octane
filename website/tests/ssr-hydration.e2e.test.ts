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
import { createServer } from 'node:net';
import { join } from 'node:path';

const WEBSITE = join(process.cwd(), 'website');
const ROUTES = ['/', '/docs', '/benchmarks', '/playground', '/view-transitions'];

// M0 of docs/comment-marker-elision-plan.md: per-route comment-node ceilings
// (~15% above post-M4 2026-07-09 measurements: / 1,463 · /docs 361 ·
// /benchmarks 12,061 · /playground 169). What remains on / is multi-hole host
// anchors (684 empties — order-bearing, can't elide without sibling
// bookkeeping) + component-bearing `it` pairs (145 — borrow ranges, required)
// + 187 SSR pairs. This is the CI-enforced DOM-weight ratchet — tighten as
// the elision phases land, and treat a breach as a marker-minting regression.
//
// `/` re-based 2026-07-10 (measured 1,733): the home summary chart gained a
// sixth framework series (Vue Vapor) and memo-wall/portal-swarm/ssr-throughput
// gained Solid/Vue bars — real content growth, not marker minting.
//
// `/` + `/benchmarks` re-based 2026-07-12 after the homepage/benchmarks charts
// picked up TodoMVC, chat-stream, async-waterfall and bundle-size (measured
// / 2,173 · /benchmarks 17,743): real content growth, not marker minting.
const COMMENT_CEILINGS: Record<string, number> = {
	'/': 2500,
	'/docs': 415,
	'/benchmarks': 20500,
	'/playground': 195,
	// The view-transitions demo (added with the plan's Phase 5, measured 189) —
	// a handful of boundaries + control-flow arms.
	'/view-transitions': 200,
};

// A fresh ephemeral port per run — NEVER a fixed one. With a fixed port, a
// leftover server from an earlier run (or another checkout) already listening
// there makes the spawned `--strictPort` server die instantly while
// waitForHttp happily connects to the imposter — and the suite silently
// asserts against foreign code. That exact failure mode shipped a red main.
function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.once('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const { port } = srv.address() as import('node:net').AddressInfo;
			srv.close(() => resolve(port));
		});
	});
}

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

// Spawn a server in its OWN process group so stop() can kill the whole tree.
// `pnpm exec …` is a wrapper: signalling just the wrapper can orphan the real
// node server underneath, which then squats the port for every later run.
function spawnServer(args: string[]): ChildProcess {
	return spawn('pnpm', args, { cwd: WEBSITE, stdio: 'ignore', detached: true });
}

// Wait until the SPAWNED server answers. Rejects the moment the child exits —
// without that, a startup death (port conflict, build error) is invisible and
// the probe loop can end up talking to some other process entirely.
function waitForServer(child: ChildProcess, url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		let settled = false;
		const onExit = (code: number | null) => {
			settled = true;
			reject(new Error(`server for ${url} exited with code ${code} before listening`));
		};
		child.once('exit', onExit);
		const probe = async () => {
			if (settled) return;
			try {
				const res = await fetch(url);
				if (res.status < 500) {
					// An HTTP answer proves something listens on the port — not that
					// it's OUR child: it may have died mid-fetch with its 'exit'
					// dispatch still queued while a foreign process answers. Give the
					// exit event a beat to land, then require the child to be alive.
					await new Promise((r) => setTimeout(r, 50));
					if (settled) return; // onExit rejected meanwhile
					if (child.exitCode !== null || child.signalCode !== null) {
						settled = true;
						child.off('exit', onExit);
						return reject(new Error(`server at ${url} answered but the spawned process is dead`));
					}
					settled = true;
					child.off('exit', onExit);
					return resolve();
				}
			} catch {
				// not up yet
			}
			if (Date.now() > deadline) {
				settled = true;
				child.off('exit', onExit);
				return reject(new Error(`server at ${url} never came up`));
			}
			setTimeout(probe, 250);
		};
		probe();
	});
}

// Kill the child's whole process group (see spawnServer), SIGKILL fallback.
async function stop(child: ChildProcess | undefined): Promise<void> {
	if (!child || child.pid === undefined || child.exitCode !== null) return;
	const signalGroup = (sig: NodeJS.Signals) => {
		try {
			process.kill(-child.pid!, sig);
		} catch {
			child.kill(sig); // group already gone — signal the child directly
		}
	};
	signalGroup('SIGTERM');
	await new Promise((r) => {
		child.once('exit', r);
		setTimeout(r, 3000);
	});
	if (child.exitCode === null) signalGroup('SIGKILL');
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
	const comments = await page.evaluate(() => {
		const w = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
		let n = 0;
		while (w.nextNode()) n++;
		return n;
	});
	return { page, errors, main, comments };
}

describe.sequential('website dev-SSR → hydration (real browser)', () => {
	let server: ChildProcess;
	let DEV_PORT: number;

	beforeAll(async () => {
		if (!browser) return;
		DEV_PORT = await getFreePort();
		// Fresh optimize-deps cache → deterministic cold start (the warmup pass
		// below absorbs the one-time "Outdated Optimize Dep" reload).
		rmSync(join(WEBSITE, 'node_modules/.vite'), { recursive: true, force: true });
		server = spawnServer(['exec', 'vite', '--port', String(DEV_PORT), '--strictPort']);
		await waitForServer(server, `http://localhost:${DEV_PORT}/`, 60_000);
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
			const { page, errors, main, comments } = await loadRoute(
				`http://localhost:${DEV_PORT}`,
				route,
			);
			try {
				// Dev-compiled client warns on ANY hydration mismatch (recovery
				// rebuilds silently otherwise) — zero tolerance here.
				const real = errors.filter((e) => !e.includes('Failed to load resource'));
				expect(real).toEqual([]);
				expect(main.length).toBeGreaterThan(0);
				// DOM-weight ratchet (see COMMENT_CEILINGS).
				expect(comments).toBeLessThanOrEqual(COMMENT_CEILINGS[route]);
			} finally {
				await page.close();
			}
		},
	);
});

describe.sequential('website production build → hydration (octane-preview)', () => {
	let server: ChildProcess;
	let PREVIEW_PORT: number;

	beforeAll(async () => {
		if (!browser) return;
		PREVIEW_PORT = await getFreePort();
		await new Promise<void>((resolve, reject) => {
			const build = spawn('pnpm', ['exec', 'vite', 'build'], { cwd: WEBSITE, stdio: 'ignore' });
			build.once('exit', (code) =>
				code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`)),
			);
		});
		server = spawnServer(['exec', 'octane-preview', '--port', String(PREVIEW_PORT)]);
		await waitForServer(server, `http://localhost:${PREVIEW_PORT}/`, 30_000);
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
			await page.waitForFunction(() => document.querySelector('main .benchpage') !== null, null, {
				timeout: 10_000,
			});
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});
});
