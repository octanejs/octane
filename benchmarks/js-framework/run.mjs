// Local benchmark runner — drives octane (and optionally other targets)
// via Playwright. Times each js-framework-benchmark operation and prints a
// table. Uses page.evaluate(() => el.click()) to fire clicks SYNCHRONOUSLY
// inside the page, bypassing per-click CDP mouse-simulation IPC overhead
// (~10ms/click).
//
// Usage:
//   pnpm --filter octane-tsrx-jsbench dev   # .tsrx variant on 5176
//   pnpm --filter octane-jsx-jsbench dev    # .tsx (JSX) variant on 5177
//   node benchmarks/js-framework/run.mjs [iterations]   # default 8
//   BENCH_JSON=results/js-framework.json node run.mjs   # + machine-readable copy
//
// By default this drives BOTH octane authoring dialects and reports the
// jsx/tsrx ratio. Both lower to the SAME compiled output: `.tsrx`
// `@for (...; key)` and React-style `.tsx` `items.map(... key=)` each compile
// to octane's keyed forBlock fast path (the compiler recognizes a keyed JSX
// `.map` and compiles it like `@for`), so the ratio is expected to sit ~1.0.
// It exists as a regression tripwire: a ratio drifting above 1 means a change
// knocked the JSX dialect off the fast path. Run only one by passing a
// TARGETS env.
//
// To compare against an inferno-next baseline (or any other target whose
// bench app exposes the same DOM contract), keep its dev server running
// and pass a TARGETS env var:
//   TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5176/","ready":"#run"},
//             {"name":"inferno-next","url":"http://localhost:5175/","ready":"#run"}]' \
//     node run.mjs

import fs from 'node:fs';
import { chromium } from 'playwright';

const ITER = parseInt(process.argv[2] || '8', 10);
const ROW_COUNT = 1000;
const ROW_COUNT_LARGE = 10000; // matches the canonical suite's runlots / clear table size

const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5176/', ready: '#run' },
			{ name: 'octane-jsx', url: 'http://localhost:5177/', ready: '#run' },
			{ name: 'react', url: 'http://localhost:5175/', ready: '#run' },
			{ name: 'ripple', url: 'http://localhost:5178/', ready: '#run' },
		];

const OPS = [
	{ name: 'run', pre: 'empty', click: '#run' },
	{ name: 'replace', pre: 'rows', click: '#run' },
	// Canonical krausest "append 1,000 rows to a table of 1,000 rows". The
	// next op's ensureState sees 2000 rows ≠ 1000 and rebuilds via #run.
	{ name: 'add', pre: 'rows', click: '#add' },
	{ name: 'update', pre: 'rows', click: '#update' },
	{ name: 'select', pre: 'rows', click: 'tbody tr:nth-child(5) td:nth-child(2) a' },
	{ name: 'swap', pre: 'rows', click: '#swaprows' },
	{ name: 'remove', pre: 'rows', click: 'tbody tr:nth-child(5) td:nth-child(3) a' },
	{ name: 'runlots', pre: 'empty', click: '#runlots' },
	// Canonical js-framework-benchmark `clear` measures clearing the
	// 10K-row table that `runlots` populated — NOT the 1K-row table from
	// `run`. The previous `pre: 'rows'` rebuilt 1K rows before the timed
	// click, so reported numbers were ~10x too fast and not comparable to
	// the upstream suite. Use `rows-large` to ensure the 10K state first.
	{ name: 'clear', pre: 'rows-large', click: '#clear' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureState(page, pre) {
	if (pre === 'empty') {
		await page.evaluate(() => {
			const btn = document.getElementById('clear');
			if (btn) btn.click();
		});
		await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 0, {
			timeout: 5000,
		});
	} else if (pre === 'rows') {
		const cnt = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
		if (cnt !== ROW_COUNT) {
			await page.evaluate(() => document.getElementById('run').click());
			await page.waitForFunction(
				(n) => document.querySelectorAll('tbody tr').length === n,
				ROW_COUNT,
				{ timeout: 5000 },
			);
		}
	} else if (pre === 'rows-large') {
		const cnt = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
		if (cnt !== ROW_COUNT_LARGE) {
			await page.evaluate(() => document.getElementById('runlots').click());
			await page.waitForFunction(
				(n) => document.querySelectorAll('tbody tr').length === n,
				ROW_COUNT_LARGE,
				{ timeout: 5000 },
			);
		}
	}
	await sleep(20);
}

// Time ONLY the synchronous click handler: the target commits its DOM mutation
// synchronously on the discrete click (octane flushes on the event), so the
// post-click rAF + task wait was pure noise — ~16ms of frame latency + the paint
// of up to 10K rows, which swamped and destabilised the real JS work. A gc()
// right before each sample keeps a surprise collection from inflating it.
// (Any TARGETS added here must likewise commit synchronously on click.)
async function timeClick(page, sel) {
	return await page.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (!el) throw new Error('selector not found: ' + sel);
		(window.gc || (() => {}))();
		const t0 = performance.now();
		el.click();
		return performance.now() - t0;
	}, sel);
}

async function runTarget(t) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--js-flags=--expose-gc'],
	});
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(t.url, { waitUntil: 'load' });
	await page.waitForSelector(t.ready, { timeout: 10000 });

	// Warmup — let JIT settle.
	for (let i = 0; i < 3; i++) {
		await page.evaluate(() => document.getElementById('run').click());
		await sleep(120);
		await page.evaluate(() => document.getElementById('clear').click());
		await sleep(80);
	}

	const results = {};
	for (const op of OPS) {
		const samples = [];
		for (let i = 0; i < ITER; i++) {
			await ensureState(page, op.pre);
			const dt = await timeClick(page, op.click);
			samples.push(dt);
			await sleep(60);
		}
		samples.sort((a, b) => a - b);
		const median = samples[samples.length >> 1];
		const min = samples[0];
		results[op.name] = { median, min, samples };
	}

	await browser.close();
	return results;
}

(async () => {
	const all = {};
	for (const t of TARGETS) {
		console.error(`Running ${t.name} (${t.url}) × ${ITER}…`);
		all[t.name] = await runTarget(t);
	}

	const cols = TARGETS.map((t) => t.name);
	const W = 26;
	console.log();
	console.log('Op       | ' + cols.map((c) => c.padEnd(W)).join('| '));
	console.log('---------+-' + cols.map(() => '-'.repeat(W)).join('+-'));
	for (const op of OPS) {
		const row = [op.name.padEnd(8)];
		for (const c of cols) {
			const r = all[c][op.name];
			row.push(`${r.median.toFixed(2)} (min ${r.min.toFixed(2)})`.padEnd(W));
		}
		console.log(row.join('| '));
	}

	// Pairwise ratio: when more than one target was driven, treat the FIRST
	// target as the baseline and report every other target as a ratio of it.
	// Single-target runs skip this block (nothing to compare against).
	if (TARGETS.length > 1) {
		const baselineName = TARGETS[0].name;
		const baseline = all[baselineName];
		console.log();
		for (const t of TARGETS.slice(1)) {
			const r = all[t.name];
			console.log(`${t.name} / ${baselineName} ratio (median; <1 means ${t.name} faster):`);
			for (const op of OPS) {
				const ratio = r[op.name].median / baseline[op.name].median;
				const tag = ratio < 0.95 ? '++ faster' : ratio < 1.05 ? '== ~equal' : '-- slower';
				console.log(`  ${op.name.padEnd(8)} ${ratio.toFixed(2)}x  ${tag}`);
			}
			console.log();
		}
	}

	// Machine-readable results for the CI runner (see the BENCH_JSON contract
	// in the benchmarks README): milliseconds, one ops map per target.
	if (process.env.BENCH_JSON) {
		const payload = {
			suite: 'js-framework',
			iterations: ITER,
			targets: TARGETS.map((t) => ({
				name: t.name,
				ops: Object.fromEntries(
					OPS.map((op) => {
						const r = all[t.name][op.name];
						return [op.name, { median: r.median, min: r.min, samples: r.samples.length }];
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
