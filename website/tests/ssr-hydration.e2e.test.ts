// Dev-SSR → real-browser hydration smoke — the seam every historical website
// breakage lived in (router-parity SSR regression, the 2026-07-08 bare-Symbol()
// slot regression) and the one the jsdom suites can't see: those client-render
// only, while `pnpm dev` server-renders each route with PROD-mode-compiled
// server modules and hydrates with DEV-mode client modules. This spec boots the
// REAL vite dev server, loads every route in headless Chromium, and fails on
// any hydration-mismatch warning or page error; then builds and repeats against
// the production `octane-preview` server (prod output has no mismatch warnings
// — dev-gated — so there the gate is "no errors + routes render + client-side
// nav works + the playground compiles, runs, and handles an iframe event").
//
// Runs inside the website vitest project (playwright as a library). Chromium is
// a required prerequisite; CI installs it (see ci.yml), and local runs fail
// with the exact setup command when it is missing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const WEBSITE = join(process.cwd(), 'website');
const ROUTES = [
	'/',
	'/docs',
	'/docs/core-apis',
	'/docs/tsrx-vs-tsx',
	'/docs/differences-from-react',
	'/docs/profiling',
	'/docs/bindings',
	'/benchmarks',
	'/playground',
];

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

// One shared browser for both the development and production passes.
let chromium: typeof import('playwright').chromium;
let browser: import('playwright').Browser;

beforeAll(async () => {
	try {
		({ chromium } = await import('playwright'));
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'[ssr-hydration.e2e] Chromium is required ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}
}, 60_000);

afterAll(async () => {
	await browser.close();
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

// Load `path`, collecting console errors and page errors after hydration has
// had two animation frames to settle.
async function loadRoute(base: string, path: string) {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
	await page.goto(base + path, { waitUntil: 'load' });
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);
	const main = (await page.evaluate(() => document.querySelector('main')?.textContent)) ?? '';
	return { page, errors, main };
}

interface RouteGeometry {
	bodyHeight: number;
	footerTop: number;
	explorerHeight: number | null;
	calloutHeight: number | null;
	calloutFollowingTop: number | null;
	searchWidth: number;
}

async function measureRouteGeometry(
	base: string,
	path: string,
	javaScriptEnabled: boolean,
): Promise<RouteGeometry> {
	const context = await browser.newContext({
		javaScriptEnabled,
		viewport: { width: 1440, height: 900 },
	});
	const page = await context.newPage();
	try {
		await page.goto(base + path, { waitUntil: 'load' });
		await page.evaluate(async (hydrated) => {
			await document.fonts.ready;
			if (!hydrated) return;
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			);
		}, javaScriptEnabled);
		return await page.evaluate(() => {
			const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
			const callout = document.querySelector('.doc-callout');
			const following = callout?.nextElementSibling?.getBoundingClientRect();
			return {
				bodyHeight: document.body.getBoundingClientRect().height,
				footerTop: rect('footer')?.top ?? -1,
				explorerHeight: rect('section.explorer .bx')?.height ?? null,
				calloutHeight: callout?.getBoundingClientRect().height ?? null,
				calloutFollowingTop: following?.top ?? null,
				searchWidth: rect('.search-trigger')?.width ?? -1,
			};
		});
	} finally {
		await context.close();
	}
}

async function waitForLocatorText(
	locator: import('playwright').Locator,
	expected: string,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if ((await locator.textContent())?.trim() === expected) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`locator did not reach text ${JSON.stringify(expected)} within ${timeoutMs}ms`);
}

async function clickUntilLocatorText(
	trigger: import('playwright').Locator,
	result: import('playwright').Locator,
	expected: string,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if ((await result.textContent())?.trim() === expected) return;
		await trigger.click();
		if ((await result.textContent())?.trim() === expected) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(
		`click did not make locator reach text ${JSON.stringify(expected)} within ${timeoutMs}ms`,
	);
}

describe.sequential('website dev-SSR → hydration (real browser)', () => {
	let server: ChildProcess;
	let DEV_PORT: number;

	beforeAll(async () => {
		if (!browser) return;
		DEV_PORT = await getFreePort();
		// Fresh optimize-deps cache → prove the declared dependency graph handles
		// a deterministic cold start without an "Outdated Optimize Dep" reload.
		rmSync(join(WEBSITE, 'node_modules/.vite'), { recursive: true, force: true });
		server = spawnServer(['exec', 'vite', '--port', String(DEV_PORT), '--strictPort']);
		await waitForServer(server, `http://localhost:${DEV_PORT}/`, 60_000);
	}, 120_000);

	afterAll(async () => {
		await stop(server);
	});

	it.for(ROUTES)(
		'%s hydrates with no mismatch and no page errors',
		{ timeout: 30_000 },
		async (route) => {
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

	it('the homepage benchmark explorer preserves its complete SSR view through hydration', async () => {
		const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/');
		try {
			const explorer = page.locator('section.explorer .bx');
			await explorer.waitFor();

			// The bar chart and heatmap are already present in SSR output. Keeping them
			// through hydration prevents the large footer jump the fallback swap caused.
			expect(await page.locator('.bx-plot').count()).toBe(1);
			expect(await page.locator('.bx-heat').count()).toBe(1);
			expect(await page.locator('.bx-fallback-table').count()).toBe(0);

			const real = errors.filter((error) => !error.includes('Failed to load resource'));
			expect(real).toEqual([]);
		} finally {
			await page.close();
		}
	}, 30_000);

	it('the benchmark Visx charts preserve their server geometry through hydration', async () => {
		const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/benchmarks');
		try {
			const charts = page.locator('svg.bench-chart');
			expect(await charts.count()).toBe(18);
			const firstChart = charts.first();
			const serverChart = await firstChart.elementHandle();
			expect(serverChart).toBeTruthy();
			const geometry = await firstChart.evaluate((svg) => ({
				width: svg.getAttribute('width'),
				height: svg.getAttribute('height'),
				viewBox: svg.getAttribute('viewBox'),
				bars: svg.querySelectorAll('.visx-bar').length,
			}));

			await page.waitForTimeout(750);

			expect(await page.locator('.recharts-wrapper').count()).toBe(0);
			expect(await page.locator('.bench-plot-shell').count()).toBe(0);
			expect(await charts.count()).toBe(18);
			expect(
				await page.evaluate(
					(original) => document.querySelector('svg.bench-chart') === original,
					serverChart,
				),
			).toBe(true);
			expect(
				await firstChart.evaluate((svg) => ({
					width: svg.getAttribute('width'),
					height: svg.getAttribute('height'),
					viewBox: svg.getAttribute('viewBox'),
					bars: svg.querySelectorAll('.visx-bar').length,
				})),
			).toEqual(geometry);
			expect(geometry.bars).toBeGreaterThan(0);
			const real = errors.filter((error) => !error.includes('Failed to load resource'));
			expect(real).toEqual([]);
		} finally {
			await page.close();
		}
	}, 30_000);

	it('the Core APIs live examples handle events after hydration', async () => {
		const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/docs/core-apis');
		try {
			const count = page.locator('.demo-count');
			await waitForLocatorText(count, '0');
			await clickUntilLocatorText(page.getByRole('button', { name: 'Add one' }), count, '1');

			const packingDemo = page.locator('[data-demo="lists"]');
			const packingStatus = packingDemo.locator('.packing-summary');
			const passport = packingDemo.getByRole('checkbox', { name: 'Passport' });
			expect(await passport.isChecked()).toBe(false);
			expect(await packingDemo.getByRole('button', { name: /^(Pack|Unpack) / }).count()).toBe(0);
			await passport.check();
			await waitForLocatorText(packingStatus, '2 of 3 packed');
			expect(await passport.isChecked()).toBe(true);

			await passport.blur();
			await page.keyboard.press('/');
			expect(await page.evaluate(() => document.activeElement?.id)).toBe('core-api-search');

			await page.getByRole('button', { name: 'Load profile' }).click();
			await waitForLocatorText(
				page.locator('[data-demo="data"] .data-loading'),
				'Loading profile…',
			);
			await waitForLocatorText(
				page.locator('[data-demo="data"] .profile-card strong'),
				'Ada Lovelace',
			);

			const transitionDemo = page.locator('[data-demo="transition"]');
			const overviewTab = transitionDemo.getByRole('tab', { name: 'Overview' });
			const activityTab = transitionDemo.getByRole('tab', { name: 'Activity' });
			const deploymentsTab = transitionDemo.getByRole('tab', { name: 'Deployments' });
			expect(await overviewTab.getAttribute('aria-selected')).toBe('true');
			expect(await overviewTab.evaluate((tab) => getComputedStyle(tab).backgroundColor)).not.toBe(
				await activityTab.evaluate((tab) => getComputedStyle(tab).backgroundColor),
			);
			await activityTab.click();
			await waitForLocatorText(
				transitionDemo.locator('.transition-status'),
				'Loading Activity — Overview stays on screen.',
			);
			expect(await transitionDemo.locator('[data-report]').getAttribute('data-report')).toBe(
				'overview',
			);
			expect(await activityTab.evaluate((tab) => getComputedStyle(tab).backgroundColor)).not.toBe(
				await deploymentsTab.evaluate((tab) => getComputedStyle(tab).backgroundColor),
			);
			await transitionDemo.locator('[data-report="activity"]').waitFor();
			await waitForLocatorText(transitionDemo.locator('.transition-status'), 'Activity is ready.');
			expect(await activityTab.getAttribute('aria-selected')).toBe('true');
			expect(await activityTab.evaluate((tab) => getComputedStyle(tab).backgroundColor)).not.toBe(
				await overviewTab.evaluate((tab) => getComputedStyle(tab).backgroundColor),
			);

			const deferredDemo = page.locator('[data-demo="deferred-value"]');
			await deferredDemo.getByRole('searchbox', { name: 'Search products' }).fill('camera');
			await deferredDemo.locator('.search-updating').waitFor();
			expect(await deferredDemo.locator('.product-result').count()).toBe(6);
			await page.waitForFunction(
				() =>
					document.querySelectorAll('[data-demo="deferred-value"] .product-result').length === 2,
			);
			expect(await deferredDemo.locator('.product-result').allTextContents()).toEqual([
				'Pocket cameraCategory: Photography',
				'Camera shoulder bagCategory: Photography',
			]);

			await page.locator('#core-api-profile-name').fill('Grace Hopper');
			await page.getByRole('button', { name: 'Save name' }).click();
			await waitForLocatorText(page.locator('[data-demo="form"] button[type="submit"]'), 'Saving…');
			await waitForLocatorText(
				page.locator('[data-demo="form"] .form-result'),
				'Saved Grace Hopper.',
			);

			const portalDemo = page.locator('[data-demo="portal"]');
			await portalDemo.getByRole('button', { name: 'Show saved toast' }).click();
			const portalToast = portalDemo.locator('.portal-demo-toast');
			await portalToast.waitFor();
			expect(await portalToast.evaluate((toast) => getComputedStyle(toast).display)).toBe('flex');
			expect(
				await portalDemo.evaluate((root) => {
					const toast = root.querySelector('.portal-demo-toast');
					return {
						inTarget: root.querySelector('.portal-demo-layer')?.contains(toast) ?? false,
						inLogicalParent: root.querySelector('.portal-demo-parent')?.contains(toast) ?? false,
					};
				}),
			).toEqual({ inTarget: true, inLogicalParent: false });
			await portalToast.getByRole('button', { name: 'Dismiss' }).click();
			await waitForLocatorText(
				portalDemo.locator('.portal-demo-result'),
				'Clicks observed by the logical parent: 1',
			);

			expect(await page.locator('.api-index-card li > p').count()).toBe(0);
			const badgeColors = await page
				.locator('.api-index-card li > code')
				.evaluateAll((badges) => badges.map((badge) => getComputedStyle(badge).color));
			expect(new Set(badgeColors).size).toBe(1);

			const real = errors.filter((error) => !error.includes('Failed to load resource'));
			expect(real).toEqual([]);
		} finally {
			await page.close();
		}
	}, 30_000);

	it('the embedded View Transitions controls run native transitions after hydration', async () => {
		const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/docs/core-apis');
		try {
			const demo = page.locator('[data-demo="view-transitions"]');
			const supported = await page.evaluate(
				() => typeof (document as any).startViewTransition === 'function',
			);
			expect(supported).toBe(true);

			// Wrap the native API before the first hydrated interaction so this observes
			// Octane's controller without replacing Chromium's snapshots or animations.
			await page.evaluate(() => {
				const original = (document as any).startViewTransition.bind(document);
				(window as any).__octaneViewTransitionCalls = 0;
				(window as any).__octaneViewTransitionFinished = Promise.resolve();
				(document as any).startViewTransition = (update: unknown) => {
					(window as any).__octaneViewTransitionCalls++;
					const transition = original(update);
					(window as any).__octaneViewTransitionFinished = transition.finished;
					return transition;
				};
			});

			const finishTransition = async (expectedCalls: number) => {
				await page.waitForFunction(
					(expected) => (window as any).__octaneViewTransitionCalls === expected,
					expectedCalls,
				);
				await page.evaluate(() => (window as any).__octaneViewTransitionFinished);
			};

			const cardToggle = demo.locator('#vt-toggle-card');
			await clickUntilLocatorText(cardToggle, cardToggle, 'Add card');
			await finishTransition(1);

			await demo.locator('#vt-toggle-hero').click();
			await demo.locator('.vtdemo-hero-big').waitFor();
			await finishTransition(2);

			await demo.getByRole('tab', { name: 'Details' }).click();
			await waitForLocatorText(demo.locator('.vtdemo-panel'), 'Details');
			await finishTransition(3);

			const real = errors.filter((error) => !error.includes('Failed to load resource'));
			expect(real).toEqual([]);
		} finally {
			await page.close();
		}
	}, 30_000);

	// HOT-server regression: editing app modules (HMR update + ssr page reload)
	// stamps `?t=` cache-busting timestamps onto the modules' importer chains.
	// The generated hydrate entry must keep loading the SAME browser module
	// instances as the page's own import chain afterwards — a bare
	// (analysis-hidden) dynamic import fetched timestamp-less URLs, splitting
	// the app-router singleton in two (preHydrate committed matches on one
	// instance, the page rendered the empty other) and breaking hydration on
	// EVERY reload until the dev server was restarted. Touching router.ts — a
	// plain .ts module with no self-accepting HMR handler — deterministically
	// propagates the invalidation up the client chain; the route module edit is
	// the shape from the original report. Deliberately LAST in this describe:
	// the invalidation stamps persist in the dev server for the rest of its life.
	it('hydrates cleanly on reload after HMR edits (hot server)', async () => {
		const files = [
			join(WEBSITE, 'src/pages/benchmarks/Benchmarks.tsrx'),
			join(WEBSITE, 'src/app/router.ts'),
		];
		const originals = files.map((f) => readFileSync(f, 'utf8'));
		const restore = () => files.forEach((f, i) => writeFileSync(f, originals[i]));
		try {
			// Prime the dev server's client + SSR module graphs and keep the page —
			// with its live HMR websocket — OPEN while editing (the editing-session
			// shape: the route is on screen while its files are edited). A plain
			// navigation: this first visit may race Vite's dependency-optimization
			// reload, which is irrelevant to the assertion below.
			const primer = await browser.newPage();
			await primer.goto(`http://localhost:${DEV_PORT}/benchmarks`, { waitUntil: 'networkidle' });

			// Touch each file — every write triggers the paired `(client) hmr
			// update` / full-reload + `(ssr) page reload` invalidations.
			for (let i = 0; i < files.length; i++) {
				writeFileSync(files[i], originals[i] + `\n// e2e-hmr-touch ${i}\n`);
				await new Promise((r) => setTimeout(r, 700));
			}
			restore();
			await new Promise((r) => setTimeout(r, 700));
			await primer.close();

			// A FULL reload after the edits must hydrate the route cleanly. Let the
			// module fetches + preHydrate router load finish before judging —
			// hydration (and its mismatch warnings) lands well after `load` here.
			const { page, errors, main } = await loadRoute(`http://localhost:${DEV_PORT}`, '/benchmarks');
			try {
				await page.waitForLoadState('networkidle');
				await page.waitForTimeout(500);
				const real = errors.filter((e) => !e.includes('Failed to load resource'));
				expect(real).toEqual([]);
				expect(main).toContain('Benchmark');
			} finally {
				await page.close();
			}
		} finally {
			restore();
		}
	}, 45_000);
});

describe.sequential('website production build → hydration (octane-preview)', () => {
	let server: ChildProcess;
	let PREVIEW_PORT: number;

	beforeAll(async () => {
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

	it.for(ROUTES)('%s renders and runs with no errors', { timeout: 30_000 }, async (route) => {
		const { page, errors, main } = await loadRoute(`http://localhost:${PREVIEW_PORT}`, route);
		try {
			expect(errors).toEqual([]);
			expect(main.length).toBeGreaterThan(0);
		} finally {
			await page.close();
		}
	});

	it('keeps no-JS SSR and hydrated layout geometry identical', { timeout: 30_000 }, async () => {
		const base = `http://localhost:${PREVIEW_PORT}`;
		for (const route of ['/', '/docs', '/docs/core-apis']) {
			const noJs = await measureRouteGeometry(base, route, false);
			const hydrated = await measureRouteGeometry(base, route, true);
			for (const key of Object.keys(noJs) as (keyof RouteGeometry)[]) {
				const serverValue = noJs[key];
				const clientValue = hydrated[key];
				if (serverValue === null || clientValue === null) {
					expect(clientValue, `${route} ${key}`).toBe(serverValue);
				} else {
					expect(Math.abs(clientValue - serverValue), `${route} ${key}`).toBeLessThan(1);
				}
			}
		}
	});

	it('client-side navigation works after hydration', { timeout: 30_000 }, async () => {
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

	it('playground compiles, runs, and handles an event inside its sandbox', async () => {
		const { page, errors } = await loadRoute(`http://localhost:${PREVIEW_PORT}`, '/playground');
		try {
			await page.waitForSelector('.pg-grid.ready', { timeout: 20_000 });
			const preview = page.frameLocator('iframe[title="Playground preview"]');
			const heading = preview.locator('h2');
			await waitForLocatorText(heading, 'Count: 0', 20_000);
			await preview.getByRole('button', { name: 'Increment' }).click();
			await waitForLocatorText(heading, 'Count: 1');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	}, 30_000);
});
