// recursive-context bench harness — drives every framework fixture via
// Playwright.
//
// Methodology: every op (mount, update_root, update_partial, partial_unmount /
// remount, unmount) mutates the DOM inside its adapter call — synchronously
// where the framework allows it (ripple / octane / react via `flushSync`,
// solid via `flush()`); an adapter with no public sync flush (vue-vapor)
// returns a thenable (nextTick(), settling after Vue's flushJobs) and the
// timed window extends until it settles. Either way we time ONLY the op (the
// framework's JS work) and force a GC right before each timed sample, so a
// surprise mid-sample collection can't inflate it. This isolates framework
// cost from browser paint and GC jitter and yields low-variance medians.
//
// (The previous harness awaited a `requestAnimationFrame` + task after each op;
// that ~16ms frame wait + paint + non-deterministic GC swamped the ~1–4ms of
// real work, making `update_root` in particular swing wildly run to run. The
// numbers below are smaller AND far more reproducible — they're the framework
// cost, not the browser's paint cycle.)
//
// NOTE: this measures framework JS work, not pixels-on-screen latency. Adapters
// MUST either flush their DOM mutations synchronously within the op call or
// return a thenable that settles once the mutation has landed.
//
// Usage:
//   node run.mjs [iter]   # default 20 (bench:long passes 40)

import { chromium } from 'playwright';
import fs from 'node:fs';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ITER = parseInt(process.argv[2] || '20', 10);
const WARMUP = 10;
const YIELD_MS = 5; // breathe between samples: let paint settle, don't block the page

const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5185/' },
			{ name: 'octane-jsx', url: 'http://localhost:5188/' },
			{ name: 'solid', url: 'http://localhost:5187/' },
			{ name: 'react', url: 'http://localhost:5186/' },
			{ name: 'ripple', url: 'http://localhost:5184/' },
			{ name: 'vue-vapor', url: 'http://localhost:5189/' },
			{ name: 'preact', url: 'http://localhost:5264/' },
			{ name: 'svelte', url: 'http://localhost:5275/' },
		];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summarize(samples) {
	return summarizeSamples(samples);
}

async function freshPage(browser, url) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	return { ctx, page };
}

// Untimed fatal gate: prove the full 1024-leaf tree, the 32-leaf local
// provider scope, partial teardown/remount, and full teardown all behave.
async function semanticGate(browser, url) {
	const { ctx, page } = await freshPage(browser, url);
	try {
		return await page.evaluate(async () => {
			const errors = [];
			const expect = (condition, message) => {
				if (!condition) errors.push(message);
			};
			const call = async (name) => {
				const fn = window[name];
				if (typeof fn !== 'function') throw new Error(`missing ${name}`);
				const result = fn();
				if (result && typeof result.then === 'function') await result;
			};
			const leaves = () => Array.from(document.querySelectorAll('.leaf'));
			const midLeaves = () => Array.from(document.querySelectorAll('.mid .leaf'));

			await call('__mount');
			let current = leaves();
			expect(current.length === 1024, `mount rendered ${current.length} leaves, expected 1024`);
			expect(document.querySelectorAll('.n').length === 1022, 'mount did not render 1022 .n nodes');
			expect(
				document.querySelectorAll('.mid').length === 1,
				'mount did not render one mid subtree',
			);
			expect(midLeaves().length === 32, `mid provider contains ${midLeaves().length} leaves`);
			expect(
				new Set(current.map((leaf) => leaf.textContent?.split('|')[0])).size === 1024,
				'leaf paths are not unique',
			);
			expect(
				current.every((leaf) => /^[LR]{10}\|0:0$/.test(leaf.textContent ?? '')),
				'initial leaf path/context values are incorrect',
			);

			const outsideLeaf = current.find((leaf) => leaf.textContent?.startsWith('RRRRRRRRRR|'));
			const originalMidLeaf = midLeaves()[0];
			await call('__updateRoot');
			current = leaves();
			expect(
				current.every((leaf) => /^[LR]{10}\|1:0$/.test(leaf.textContent ?? '')),
				'root update did not reach exactly all 1024 leaves',
			);

			await call('__updatePartial');
			current = leaves();
			const localOne = current.filter((leaf) => leaf.textContent?.endsWith(':1'));
			const localZero = current.filter((leaf) => leaf.textContent?.endsWith(':0'));
			expect(
				localOne.length === 32,
				`partial update reached ${localOne.length} leaves, expected 32`,
			);
			expect(localZero.length === 992, `partial update left ${localZero.length} root-only leaves`);
			expect(
				midLeaves().every((leaf) => /^[LR]{10}\|1:1$/.test(leaf.textContent ?? '')),
				'partial context value escaped or missed the mid subtree',
			);

			await call('__partialUnmount');
			current = leaves();
			expect(current.length === 992, `partial unmount left ${current.length} leaves, expected 992`);
			expect(document.querySelectorAll('.mid').length === 0, 'partial unmount left the mid DOM');
			expect(current.includes(outsideLeaf), 'partial unmount replaced an unaffected leaf');

			await call('__partialRemount');
			current = leaves();
			expect(current.length === 1024, `partial remount rendered ${current.length} leaves`);
			expect(
				midLeaves().length === 32,
				`partial remount restored ${midLeaves().length} mid leaves`,
			);
			expect(midLeaves()[0] !== originalMidLeaf, 'partial remount reused a removed leaf node');
			expect(
				midLeaves().every((leaf) => /^[LR]{10}\|1:1$/.test(leaf.textContent ?? '')),
				'partial remount lost scoped context state',
			);

			await call('__unmount');
			expect(document.querySelectorAll('.leaf').length === 0, 'unmount left leaves');
			const root = document.getElementById('main');
			expect(
				root?.querySelector('*') === null && root.textContent?.trim() === '',
				'unmount left rendered root content',
			);
			await call('__reset');
			expect(document.getElementById('main')?.childNodes.length === 0, 'reset left root DOM');
			return errors;
		});
	} finally {
		await ctx.close();
	}
}

// MOUNT — fresh page per sample (module-eval amortized by goto, quiescent start);
// time the synchronous __mount() with a freshly-collected heap.
async function measureMount(browser, url) {
	const samples = [];
	for (let i = 0; i < WARMUP + ITER; i++) {
		const { ctx, page } = await freshPage(browser, url);
		const dt = await page.evaluate(async () => {
			(window.gc || (() => {}))();
			const t0 = performance.now();
			const result = window.__mount();
			if (result && typeof result.then === 'function') await result;
			return performance.now() - t0;
		});
		if (i >= WARMUP) samples.push(dt);
		await ctx.close();
	}
	return summarize(samples);
}

// LOOP op (update_root / update_partial) — mount once, time the op in a tight
// in-page loop with gc() before each sample.
async function measureLoop(browser, url, op) {
	const { ctx, page } = await freshPage(browser, url);
	await page.evaluate(async () => {
		const result = window.__mount();
		if (result && typeof result.then === 'function') await result;
	});
	await sleep(50);
	const samples = await page.evaluate(
		async ({ op, WARMUP, ITER, YIELD_MS }) => {
			const fn = window[op];
			const gc = window.gc || (() => {});
			const out = [];
			for (let i = 0; i < WARMUP + ITER; i++) {
				gc();
				const t0 = performance.now();
				const r = fn();
				if (r && typeof r.then === 'function') await r;
				const dt = performance.now() - t0;
				if (i >= WARMUP) out.push(dt);
				await new Promise((r) => setTimeout(r, YIELD_MS));
			}
			return out;
		},
		{ op, WARMUP, ITER, YIELD_MS },
	);
	await ctx.close();
	return summarize(samples);
}

// UNMOUNT — per sample: mount (untimed), settle, time the synchronous
// __unmount(), reset.
async function measureUnmount(browser, url) {
	const { ctx, page } = await freshPage(browser, url);
	const samples = await page.evaluate(
		async ({ WARMUP, ITER, YIELD_MS }) => {
			const gc = window.gc || (() => {});
			const out = [];
			for (let i = 0; i < WARMUP + ITER; i++) {
				const mounted = window.__mount();
				if (mounted && typeof mounted.then === 'function') await mounted;
				await new Promise((r) => setTimeout(r, YIELD_MS));
				gc();
				const t0 = performance.now();
				const unmounted = window.__unmount();
				if (unmounted && typeof unmounted.then === 'function') await unmounted;
				const dt = performance.now() - t0;
				const reset = window.__reset();
				if (reset && typeof reset.then === 'function') await reset;
				if (i >= WARMUP) out.push(dt);
				await new Promise((r) => setTimeout(r, YIELD_MS));
			}
			return out;
		},
		{ WARMUP, ITER, YIELD_MS },
	);
	await ctx.close();
	return summarize(samples);
}

// PARTIAL unmount/remount — mount once; each iter time __partialUnmount then
// __partialRemount (mirrored work), recording both halves of the cycle.
async function measurePartialUnmountRemount(browser, url) {
	const { ctx, page } = await freshPage(browser, url);
	await page.evaluate(async () => {
		const result = window.__mount();
		if (result && typeof result.then === 'function') await result;
	});
	await sleep(50);
	const { u, r } = await page.evaluate(
		async ({ WARMUP, ITER, YIELD_MS }) => {
			const gc = window.gc || (() => {});
			const u = [];
			const r = [];
			for (let i = 0; i < WARMUP + ITER; i++) {
				gc();
				let t0 = performance.now();
				const ru = window.__partialUnmount();
				if (ru && typeof ru.then === 'function') await ru;
				const du = performance.now() - t0;
				await new Promise((res) => setTimeout(res, YIELD_MS));
				gc();
				t0 = performance.now();
				const rr = window.__partialRemount();
				if (rr && typeof rr.then === 'function') await rr;
				const dr = performance.now() - t0;
				if (i >= WARMUP) {
					u.push(du);
					r.push(dr);
				}
				await new Promise((res) => setTimeout(res, YIELD_MS));
			}
			return { u, r };
		},
		{ WARMUP, ITER, YIELD_MS },
	);
	await ctx.close();
	return { partial_unmount: summarize(u), partial_remount: summarize(r) };
}

async function runTarget(t) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'],
	});

	try {
		console.error(`  → semantic gate`);
		const gateErrors = await semanticGate(browser, t.url);
		if (gateErrors.length > 0) return { gateErrors, results: null };

		const { ctx, page } = await freshPage(browser, t.url);
		const hasGc = await page.evaluate(() => typeof window.gc === 'function');
		await ctx.close();
		if (!hasGc) {
			console.error(
				'  ! window.gc unavailable (need --js-flags=--expose-gc) — results will be noisier',
			);
		}

		console.error(`  → mount`);
		const mount = await measureMount(browser, t.url);
		console.error(`  → update_root`);
		const update_root = await measureLoop(browser, t.url, '__updateRoot');
		console.error(`  → update_partial`);
		const update_partial = await measureLoop(browser, t.url, '__updatePartial');
		console.error(`  → partial_unmount/remount`);
		const { partial_unmount, partial_remount } = await measurePartialUnmountRemount(browser, t.url);
		console.error(`  → unmount`);
		const unmount = await measureUnmount(browser, t.url);
		return {
			gateErrors: [],
			results: {
				mount,
				update_root,
				update_partial,
				partial_unmount,
				partial_remount,
				unmount,
			},
		};
	} finally {
		await browser.close();
	}
}

const OPS = [
	'mount',
	'update_root',
	'update_partial',
	'partial_unmount',
	'partial_remount',
	'unmount',
];

(async () => {
	const all = {};
	const failures = [];
	const failedTargets = new Set();
	for (const t of TARGETS) {
		console.error(`Running ${t.name} (${t.url}) × ${ITER} (+${WARMUP} warmup)…`);
		try {
			const { gateErrors, results } = await runTarget(t);
			if (gateErrors.length > 0) {
				failedTargets.add(t.name);
				for (const error of gateErrors) {
					const message = `${t.name}: semantic gate: ${error}`;
					failures.push(message);
					console.error(`  ✗ ${message}`);
				}
				continue;
			}
			all[t.name] = results;
		} catch (error) {
			failedTargets.add(t.name);
			const message = `${t.name}: ${error instanceof Error ? error.message : String(error)}`;
			failures.push(message);
			console.error(`  ✗ ${message}`);
		}
	}

	const successfulTargets = TARGETS.filter((t) => all[t.name]);
	const cols = successfulTargets.map((t) => t.name);
	const W = 32;
	console.log();
	console.log('Op               | ' + cols.map((c) => c.padEnd(W)).join('| '));
	console.log('-----------------+-' + cols.map(() => '-'.repeat(W)).join('+-'));
	for (const op of OPS) {
		const row = [op.padEnd(16)];
		for (const c of cols) {
			const r = all[c][op];
			row.push(
				`${r.median.toFixed(2)} (min ${r.min.toFixed(2)}, sd ${r.stddev.toFixed(2)})`.padEnd(W),
			);
		}
		console.log(row.join('| '));
	}

	if (successfulTargets.length > 1) {
		const baselineName =
			successfulTargets.find((target) => target.name === 'vue-vapor')?.name ??
			successfulTargets.at(-1).name;
		const baseline = all[baselineName];
		console.log();
		for (const t of successfulTargets) {
			if (t.name === baselineName) continue;
			const r = all[t.name];
			console.log(`${t.name} / ${baselineName} ratio (score; <1 means ${t.name} faster):`);
			for (const op of OPS) {
				const ratio = scoreOf(r[op]) / scoreOf(baseline[op]);
				const tag = ratio < 0.95 ? '++ faster' : ratio < 1.05 ? '== ~equal' : '-- slower';
				console.log(`  ${op.padEnd(16)} ${ratio.toFixed(2)}x  ${tag}`);
			}
			console.log();
		}

		// Locality ratio — partial should be far cheaper than full root fan-out.
		// 32-of-1024 leaves means the floor is ~1/32 = 0.03; anything close to 1
		// means the framework is re-running unaffected branches.
		console.log('locality ratio (update_partial / update_root, lower = better scoping):');
		for (const c of cols) {
			const r = all[c];
			const ratio = scoreOf(r.update_partial) / scoreOf(r.update_root);
			console.log(`  ${c.padEnd(16)} ${ratio.toFixed(3)}x  (ideal: ~0.03)`);
		}
	}

	// Machine-readable results for the unified bench runner (see the BENCH_JSON
	// contract in benchmarks/README.md): milliseconds, one ops map per target.
	if (process.env.BENCH_JSON) {
		const payload = {
			suite: 'recursive-context',
			iterations: ITER,
			targets: TARGETS.map((t) => ({
				name: t.name,
				ops: all[t.name]
					? Object.fromEntries(
							OPS.map((op) => {
								const r = all[t.name][op];
								return [op, timingStatForJson(r)];
							}),
						)
					: {},
				meta: { gates: failedTargets.has(t.name) ? 'fail' : 'pass' },
			})),
		};
		if (failures.length > 0) payload.failed = failures.join('; ');
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
		console.error(`BENCH_JSON written to ${process.env.BENCH_JSON}`);
	}

	if (failures.length > 0) {
		console.error(`\n✗ ${failures.length} failure(s):`);
		for (const failure of failures) console.error(`  - ${failure}`);
		process.exitCode = 1;
	}
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
