// dbmon bench harness — drives octane-tsrx / octane-jsx / react via Playwright.
//
// dbmon (dbmonster) stresses the UPDATE path: a table of DB_COUNT rows × 7 cells
// whose text + threshold class churn every frame. Where js-framework measures
// bulk create/clear and recursive-context measures deep Context fan-out, this
// isolates per-cell diff throughput + bulk keyed remount.
//
// Methodology mirrors the sibling benches: every op mutates the DOM
// SYNCHRONOUSLY inside its adapter call (octane/react via flushSync), so we time
// ONLY the framework's JS work, and force a GC right before each timed sample so
// a stray collection can't inflate it. Medians are framework cost, not paint.
//
// Ops:
//   mount        — render the full table (DB_COUNT rows).
//   tick         — full update: every row's count + 5 queries churn; same keys,
//                  so all rows reconcile in place and every cell diffs.
//   tick_partial — only ~10% of rows change; the rest are value-identical, so
//                  the per-binding diff-skip should make this far cheaper.
//   remount      — every key is new: all rows unmount + a fresh set mounts.
//   sort         — toggle sort order: worst-case keyed reorder (LIS moves).
//   unmount      — tear the whole table down.
//
// Servers must be running first (production preview recommended):
//   pnpm --filter octane-tsrx-dbmon-bench preview   # :5196
//   pnpm --filter octane-jsx-dbmon-bench  preview   # :5197
//   pnpm --filter react-dbmon-bench       preview   # :5198
//   pnpm --filter ripple-dbmon-bench      preview   # :5199
//   pnpm --filter solid-dbmon-bench       preview   # :5200
// (swap `preview` → `dev` for the unminified dev build).
//
// Usage:  node run.mjs [iter]   # default 30

import { chromium } from 'playwright';
import fs from 'node:fs';

const ITER = parseInt(process.argv[2] || '30', 10);
const WARMUP = 10;
const YIELD_MS = 5;

const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5196/' },
			{ name: 'octane-jsx', url: 'http://localhost:5197/' },
			{ name: 'ripple', url: 'http://localhost:5199/' },
			{ name: 'solid', url: 'http://localhost:5200/' },
			{ name: 'react', url: 'http://localhost:5198/' },
		];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summarize(samples) {
	const sorted = [...samples].sort((a, b) => a - b);
	const n = sorted.length;
	const mean = sorted.reduce((a, b) => a + b, 0) / n;
	const stddev = Math.sqrt(sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
	return {
		median: sorted[n >> 1],
		min: sorted[0],
		p95: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
		stddev,
	};
}

async function freshPage(browser, url) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	return { ctx, page };
}

// MOUNT — fresh page per sample (quiescent start); time the synchronous
// __mount() with a freshly-collected heap.
async function measureMount(browser, url) {
	const samples = [];
	for (let i = 0; i < WARMUP + ITER; i++) {
		const { ctx, page } = await freshPage(browser, url);
		const dt = await page.evaluate(() => {
			(window.gc || (() => {}))();
			const t0 = performance.now();
			window.__mount();
			return performance.now() - t0;
		});
		if (i >= WARMUP) samples.push(dt);
		await ctx.close();
	}
	return summarize(samples);
}

// LOOP op (tick / tick_partial / remount / sort) — mount once, time the op in a
// tight in-page loop with gc() before each sample.
async function measureLoop(browser, url, op) {
	const { ctx, page } = await freshPage(browser, url);
	await page.evaluate(() => window.__mount());
	await sleep(50);
	const samples = await page.evaluate(
		async ({ op, WARMUP, ITER, YIELD_MS }) => {
			const fn = window[op];
			const gc = window.gc || (() => {});
			const out = [];
			for (let i = 0; i < WARMUP + ITER; i++) {
				gc();
				const t0 = performance.now();
				fn();
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
				window.__mount();
				await new Promise((r) => setTimeout(r, YIELD_MS));
				gc();
				const t0 = performance.now();
				window.__unmount();
				const dt = performance.now() - t0;
				window.__reset();
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

async function runTarget(t) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'],
	});

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
	console.error(`  → tick`);
	const tick = await measureLoop(browser, t.url, '__tick');
	console.error(`  → tick_partial`);
	const tick_partial = await measureLoop(browser, t.url, '__tickPartial');
	console.error(`  → remount`);
	const remount = await measureLoop(browser, t.url, '__remount');
	console.error(`  → sort`);
	const sort = await measureLoop(browser, t.url, '__sort');
	console.error(`  → unmount`);
	const unmount = await measureUnmount(browser, t.url);
	await browser.close();
	return { mount, tick, tick_partial, remount, sort, unmount };
}

const OPS = ['mount', 'tick', 'tick_partial', 'remount', 'sort', 'unmount'];

(async () => {
	const all = {};
	for (const t of TARGETS) {
		console.error(`Running ${t.name} (${t.url}) × ${ITER} (+${WARMUP} warmup)…`);
		all[t.name] = await runTarget(t);
	}

	const cols = TARGETS.map((t) => t.name);
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

	if (TARGETS.length > 1) {
		const baselineName = TARGETS[TARGETS.length - 1].name;
		const baseline = all[baselineName];
		console.log();
		for (const t of TARGETS.slice(0, -1)) {
			const r = all[t.name];
			console.log(`${t.name} / ${baselineName} ratio (median; <1 means ${t.name} faster):`);
			for (const op of OPS) {
				const ratio = r[op].median / baseline[op].median;
				const tag = ratio < 0.95 ? '++ faster' : ratio < 1.05 ? '== ~equal' : '-- slower';
				console.log(`  ${op.padEnd(16)} ${ratio.toFixed(2)}x  ${tag}`);
			}
			console.log();
		}

		// Diff-skip ratio — a partial tick (~10% of rows) should be far cheaper
		// than a full tick if the per-binding diff skips unchanged cells.
		console.log('diff-skip ratio (tick_partial / tick, lower = better skipping):');
		for (const c of cols) {
			const r = all[c];
			const ratio = r.tick_partial.median / r.tick.median;
			console.log(`  ${c.padEnd(16)} ${ratio.toFixed(3)}x  (ideal: ~0.1)`);
		}
	}

	// Machine-readable results for the unified bench runner (see the BENCH_JSON
	// contract in benchmarks/README.md): milliseconds, one ops map per target.
	if (process.env.BENCH_JSON) {
		const payload = {
			suite: 'dbmon',
			iterations: ITER,
			targets: TARGETS.map((t) => ({
				name: t.name,
				ops: Object.fromEntries(
					OPS.map((op) => {
						const r = all[t.name][op];
						return [op, { median: r.median, min: r.min, p95: r.p95, sd: r.stddev, samples: ITER }];
					}),
				),
			})),
		};
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
		console.error(`BENCH_JSON written to ${process.env.BENCH_JSON}`);
	}
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
