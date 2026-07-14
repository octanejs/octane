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
import { rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { censusDomNodes, type DomNodeCensus } from '../../benchmarks/lib/dom-nodes.mjs';

const WEBSITE = join(process.cwd(), 'website');
const ROUTES = [
	'/',
	'/docs',
	'/docs/core-apis',
	'/docs/tsrx-vs-tsx',
	'/docs/differences-from-react',
	'/docs/bindings',
	'/benchmarks',
	'/playground',
];

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
//
// `/` + `/benchmarks` re-based 2026-07-13 after every comparative chart gained
// Preact/Svelte series and streaming-ssr joined the page (measured / 2,210 ·
// /benchmarks 22,621). The ceilings retain roughly 15% headroom.
//
// `/` re-based again 2026-07-13 after the home summary chart turned on
// showValues (a value label on every bar — ~7 series × 14 suites of small
// recharts label trees; measured / 2,929): real content growth, not marker
// minting.
const COMMENT_CEILINGS: Record<string, number> = {
	'/': 3380,
	'/docs': 415,
	// Core APIs guide re-based 2026-07-14 (measured 777) after the View Transitions
	// and portal demos plus four dedicated API examples joined the guide. The
	// ceiling retains roughly 15% headroom for the intentional content growth.
	'/docs/core-apis': 895,
	'/docs/tsrx-vs-tsx': 1000,
	'/docs/differences-from-react': 1000,
	'/docs/bindings': 1000,
	'/benchmarks': 26100,
	'/playground': 195,
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

// Load `path`, collecting console errors + page errors; returns the rendered
// <main> text plus deterministic whole-body / main DOM censuses.
async function loadRoute(base: string, path: string) {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
	await page.goto(base + path, { waitUntil: 'load' });
	await page.waitForFunction(() =>
		Object.hasOwn(document.querySelector('#site-nav') ?? {}, '$$click'),
	);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);
	const main = (await page.evaluate(() => document.querySelector('main')?.textContent)) ?? '';
	const bodyDom = await page.evaluate(censusDomNodes, 'body');
	const mainDom = await page.evaluate(censusDomNodes, 'main');
	// Keep the legacy scalar for the existing COMMENT_CEILINGS assertion.
	return { page, errors, main, comments: bodyDom.comments, bodyDom, mainDom };
}

function assertCountedHydrationMarkers(
	bodyDom: DomNodeCensus,
	mainDom: DomNodeCensus,
	expectedLeadingLogical: number,
): void {
	// Counted comments reduce physical DOM nodes while preserving the logical
	// open/close multiplicity the hydration cursor consumes.
	expect(bodyDom.hydrationMarkersLogical).toBeGreaterThan(bodyDom.hydrationMarkersPhysical);
	expect(bodyDom.hydrationMarkersCounted).toBeGreaterThan(0);
	expect(bodyDom.hydrationMarkerMaxMultiplicity).toBeGreaterThan(1);

	// Every website route shares the router/provider prefix that motivated this
	// protocol. The eager home route has nineteen logical opens; route-level lazy
	// components add one Suspense range, for twenty. Both compact to five physical
	// comments: the remaining splits are independent Suspense frame/try ranges and
	// the shorter route-content span, not redundant wrapper bookkeeping.
	expect(mainDom.leadingHydrationStartsPhysical).toBe(5);
	expect(mainDom.leadingHydrationStartsLogical).toBe(expectedLeadingLogical);
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
			const { page, errors, main, comments, bodyDom, mainDom } = await loadRoute(
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
				assertCountedHydrationMarkers(bodyDom, mainDom, route === '/' ? 19 : 20);
			} finally {
				await page.close();
			}
		},
	);

	it('the Core APIs live examples handle events after hydration', async () => {
		const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/docs/core-apis');
		try {
			const count = page.locator('.demo-count');
			await waitForLocatorText(count, '0');
			await page.getByRole('button', { name: 'Add one' }).click();
			await waitForLocatorText(count, '1');

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

			// Wrap the native API after hydration so this observes Octane's controller
			// without replacing Chromium's snapshots or animations.
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

			await demo.locator('#vt-toggle-card').click();
			await waitForLocatorText(demo.locator('#vt-toggle-card'), 'Add card');
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
		const { page, errors, main, bodyDom, mainDom } = await loadRoute(
			`http://localhost:${PREVIEW_PORT}`,
			route,
		);
		try {
			expect(errors).toEqual([]);
			expect(main.length).toBeGreaterThan(0);
			assertCountedHydrationMarkers(bodyDom, mainDom, route === '/' ? 19 : 20);
		} finally {
			await page.close();
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
