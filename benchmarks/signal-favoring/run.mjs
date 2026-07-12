// signal-favoring bench harness — drives the 100-component chain with
// stateful counters at C1, C11, C21, ..., C91 (10 stateful in total).
//
// Ops measured per target:
//   - mount             — initial render of all 100 components
//   - bump_shallow      — bump C1; in hook frameworks this cascades through
//                         C1→C100 (99 component re-renders). In signal
//                         frameworks (solid, ripple) only the single `{v}`
//                         text expression inside C1 recomputes.
//   - bump_middle       — bump C51; ~50 cascading renders for hooks, 1 expr
//                         for signals.
//   - bump_deep         — bump C91; ~10 cascading renders for hooks, 1 expr
//                         for signals.
//   - bump_sweep        — bump all 10 stateful nodes, flushing after EACH
//                         (flush-on-every-change); 10 separate commits.
//   - bump_sweep_batched— bump all 10, then a SINGLE flush; the framework's
//                         natural microtask coalescing (one commit). The gap
//                         vs bump_sweep is what batching buys.
//   - unmount           — full teardown via the framework's unmount API.
//
// The bench is named "signal-favoring" because bump_shallow has a clear
// structural advantage for signals — but at this scale the absolute gap is
// often small enough that the choice doesn't dominate real-world apps.
//
// Usage:
//   pnpm --filter octane-tsrx-signal-bench dev  # :5190 (.tsrx)
//   pnpm --filter octane-jsx-signal-bench dev   # :5194 (.tsx / JSX)
//   pnpm --filter solid-signal-bench dev        # :5191
//   pnpm --filter react-signal-bench dev        # :5192
//   pnpm --filter ripple-signal-bench dev       # :5193
//   pnpm --filter vue-vapor-signal-bench dev    # :5183
//   node benchmarks/signal-favoring/run.mjs [iter]   # default 20

import { chromium } from 'playwright';
import fs from 'node:fs';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ITER = parseInt(process.argv[2] || '20', 10);
const WARMUP = 5;
const STATEFUL_INDICES = [1, 11, 21, 31, 41, 51, 61, 71, 81, 91];

const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5190/' },
			{ name: 'octane-jsx', url: 'http://localhost:5194/' },
			{ name: 'solid', url: 'http://localhost:5191/' },
			{ name: 'react', url: 'http://localhost:5192/' },
			{ name: 'ripple', url: 'http://localhost:5193/' },
			{ name: 'vue-vapor', url: 'http://localhost:5183/' },
			{ name: 'preact', url: 'http://localhost:5265/' },
			{ name: 'svelte', url: 'http://localhost:5276/' },
		];

const YIELD_MS = 5; // breathe between samples: let paint settle, don't block the page
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// All ops mutate the DOM inside the adapter call — synchronously where the
// framework allows it (ripple / octane / react via flushSync, solid via
// flush()); an adapter with no public sync flush (vue-vapor) returns a
// thenable (nextTick(), settling after Vue's flushJobs) and the timed window
// extends until it settles — awaited BETWEEN reps so bumps can't coalesce
// into one commit. Either way we time ONLY the framework's work and force a
// GC right before each timed sample. This isolates framework JS work from
// browser paint + GC jitter — the prior rAF + task wait added ~16ms of frame
// latency that swamped the sub-ms signal and made medians swing run-to-run.
// See recursive-context/run.mjs for the same methodology.

async function freshPage(browser, url) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	return { ctx, page };
}

// Untimed fatal gate: prove all 100 chain nodes mount, each stateful site
// updates the intended value, both batch orders reach the same values, and
// teardown clears the root before accepting timings.
async function semanticGate(browser, url) {
	const { ctx, page } = await freshPage(browser, url);
	try {
		return await page.evaluate(async (indices) => {
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
			const ownText = (element) => {
				if (!element) return '';
				const clone = element.cloneNode(true);
				clone.querySelector(':scope > .c, :scope > .leaf')?.remove();
				return clone.textContent.replace(/\s+/g, '');
			};
			const chain = () => Array.from(document.querySelectorAll('.c'));
			const readValues = () => {
				const nodes = chain();
				return Object.fromEntries(
					indices.map((index) => {
						const match = ownText(nodes[index - 1]).match(new RegExp(`^${index}:(-?\\d+)$`));
						return [index, match ? Number(match[1]) : null];
					}),
				);
			};
			const expectValues = (expected, label) => {
				const actual = readValues();
				for (const index of indices) {
					expect(
						actual[index] === expected[index],
						`${label}: C${index}=${actual[index]}, expected ${expected[index]}`,
					);
				}
			};

			await call('__mount');
			const nodes = chain();
			expect(nodes.length === 99, `mount rendered ${nodes.length} chain divs, expected 99`);
			expect(document.querySelectorAll('.leaf').length === 1, 'mount did not render one C100 leaf');
			expect(document.querySelector('.leaf')?.textContent === '100', 'C100 leaf text is incorrect');
			for (let i = 0; i < 98; i++) {
				expect(
					nodes[i]?.querySelector(':scope > .c') === nodes[i + 1],
					`C${i + 1} is not the direct parent of C${i + 2}`,
				);
			}
			expect(nodes[98]?.querySelector(':scope > .leaf') !== null, 'C99 does not own C100');
			for (let index = 1; index <= 99; index++) {
				const expected = indices.includes(index) ? `${index}:0` : String(index);
				expect(ownText(nodes[index - 1]) === expected, `C${index} label is not "${expected}"`);
			}
			expectValues(Object.fromEntries(indices.map((index) => [index, 0])), 'mount');

			await call('__bumpAt1');
			await call('__bumpAt51');
			await call('__bumpAt91');
			let expected = Object.fromEntries(
				indices.map((index) => [index, index === 1 || index === 51 || index === 91 ? 1 : 0]),
			);
			expectValues(expected, 'single bumps');

			for (const index of indices) await call('__bumpAt' + index);
			expected = Object.fromEntries(indices.map((index) => [index, expected[index] + 1]));
			expectValues(expected, 'unbatched sweep');

			await call('__sweepBatched');
			expected = Object.fromEntries(indices.map((index) => [index, expected[index] + 1]));
			expectValues(expected, 'ancestor-first batch');

			await call('__sweepBatchedReverse');
			expected = Object.fromEntries(indices.map((index) => [index, expected[index] + 1]));
			expectValues(expected, 'descendant-first batch');

			await call('__unmount');
			expect(document.querySelectorAll('.c, .leaf').length === 0, 'unmount left chain nodes');
			const root = document.getElementById('main');
			expect(
				root?.querySelector('*') === null && root.textContent?.trim() === '',
				'unmount left rendered root content',
			);
			await call('__reset');
			expect(document.getElementById('main')?.childNodes.length === 0, 'reset left root DOM');
			return errors;
		}, STATEFUL_INDICES);
	} finally {
		await ctx.close();
	}
}

function summarize(samples) {
	return summarizeSamples(samples);
}

// MOUNT — fresh page per sample; time the synchronous __mount() on a clean heap.
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

// A single bump is one text-node update for a signal framework — far below
// performance.now()'s effective resolution. So each timed sample loops BUMP_REPS
// bumps and divides, giving a stable per-bump time that's meaningful at 2-decimal
// precision (instead of rounding to 0.00ms). Standard micro-benchmark practice.
const BUMP_REPS = 50;

// BUMP — mount once, time per-bump cost (BUMP_REPS bumps per sample) in a tight
// in-page loop with gc() before each sample.
async function measureBump(browser, url, idx) {
	const { ctx, page } = await freshPage(browser, url);
	await page.evaluate(async () => {
		const result = window.__mount();
		if (result && typeof result.then === 'function') await result;
	});
	await sleep(50);
	const samples = await page.evaluate(
		async ({ idx, REPS, WARMUP, ITER, YIELD_MS }) => {
			const fn = window['__bumpAt' + idx];
			if (typeof fn !== 'function') throw new Error('missing __bumpAt' + idx);
			const gc = window.gc || (() => {});
			const out = [];
			for (let i = 0; i < WARMUP + ITER; i++) {
				gc();
				const t0 = performance.now();
				for (let k = 0; k < REPS; k++) {
					const r = fn();
					if (r && typeof r.then === 'function') await r;
				}
				const dt = (performance.now() - t0) / REPS;
				if (i >= WARMUP) out.push(dt);
				await new Promise((r) => setTimeout(r, YIELD_MS));
			}
			return out;
		},
		{ idx, REPS: BUMP_REPS, WARMUP, ITER, YIELD_MS },
	);
	await ctx.close();
	return summarize(samples);
}

// SWEEP — bump all 10 stateful nodes per sample. `batchFn` selects the mode:
//   null                    → each bump flushes (10 separate commits, "flush on
//                             every change"); the worst case, no coalescing.
//   '__sweepBatched'        → all 10 enqueue ANCESTOR-first, then ONE flush; the
//                             framework's natural coalescing, bounded synchronously.
//   '__sweepBatchedReverse' → the same single flush, but enqueued DESCENDANT-first.
//                             For a hook framework that coalesces overlapping
//                             cascades only in queue order, this de-coalesces back
//                             toward the per-bump cost; an order-independent
//                             scheduler (and signal frameworks, which don't cascade)
//                             stays flat. The reverse-vs-forward gap is the metric.
// All modes end in the same DOM. Timed synchronously with gc() before each sample.
async function measureSweep(browser, url, batchFn) {
	const { ctx, page } = await freshPage(browser, url);
	await page.evaluate(async () => {
		const result = window.__mount();
		if (result && typeof result.then === 'function') await result;
	});
	await sleep(50);
	const samples = await page.evaluate(
		async ({ indices, batchFn, WARMUP, ITER, YIELD_MS, REPEAT }) => {
			const gc = window.gc || (() => {});
			const sweep = batchFn ? window[batchFn] : null;
			if (batchFn && typeof sweep !== 'function') throw new Error('missing ' + batchFn);
			const out = [];
			for (let i = 0; i < WARMUP + ITER; i++) {
				gc();
				// A single sweep is sub-millisecond, so the OS timer quantizes it to
				// the ~0.1ms floor. Time REPEAT sweeps and divide — the per-sweep cost
				// escapes quantization while each sweep still does identical work.
				const t0 = performance.now();
				for (let k = 0; k < REPEAT; k++) {
					if (sweep) {
						const r = sweep();
						if (r && typeof r.then === 'function') await r;
					} else {
						for (const idx of indices) {
							const fn = window['__bumpAt' + idx];
							if (typeof fn !== 'function') throw new Error('missing __bumpAt' + idx);
							// An async-commit bump (vue-vapor) is awaited per change —
							// that IS the "flush on every change" mode for a microtask
							// scheduler (each await lets flushJobs run before the next).
							const r = fn();
							if (r && typeof r.then === 'function') await r;
						}
					}
				}
				const dt = (performance.now() - t0) / REPEAT;
				if (i >= WARMUP) out.push(dt);
				await new Promise((r) => setTimeout(r, YIELD_MS));
			}
			return out;
		},
		{ indices: STATEFUL_INDICES, batchFn, WARMUP, ITER, YIELD_MS, REPEAT: 25 },
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

async function runTarget(t) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'],
	});
	try {
		console.error(`  → semantic gate`);
		const gateErrors = await semanticGate(browser, t.url);
		if (gateErrors.length > 0) return { gateErrors, results: null };

		console.error(`  → mount`);
		const mount = await measureMount(browser, t.url);
		console.error(`  → bump_shallow (C1)`);
		const bump_shallow = await measureBump(browser, t.url, 1);
		console.error(`  → bump_middle (C51)`);
		const bump_middle = await measureBump(browser, t.url, 51);
		console.error(`  → bump_deep (C91)`);
		const bump_deep = await measureBump(browser, t.url, 91);
		console.error(`  → bump_sweep (10 bumps, flush each)`);
		const bump_sweep = await measureSweep(browser, t.url, null);
		console.error(`  → bump_sweep_batched (10 bumps, 1 flush, ancestor-first)`);
		const bump_sweep_batched = await measureSweep(browser, t.url, '__sweepBatched');
		console.error(`  → bump_sweep_reverse (10 bumps, 1 flush, descendant-first)`);
		const bump_sweep_reverse = await measureSweep(browser, t.url, '__sweepBatchedReverse');
		console.error(`  → unmount`);
		const unmount = await measureUnmount(browser, t.url);
		return {
			gateErrors: [],
			results: {
				mount,
				bump_shallow,
				bump_middle,
				bump_deep,
				bump_sweep,
				bump_sweep_batched,
				bump_sweep_reverse,
				unmount,
			},
		};
	} finally {
		await browser.close();
	}
}

const OPS = [
	'mount',
	'bump_shallow',
	'bump_middle',
	'bump_deep',
	'bump_sweep',
	'bump_sweep_batched',
	'bump_sweep_reverse',
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
	console.log('Op             | ' + cols.map((c) => c.padEnd(W)).join('| '));
	console.log('---------------+-' + cols.map(() => '-'.repeat(W)).join('+-'));
	// Sub-0.1ms ops (single-signal bumps are ~µs) need finer precision than the
	// ms-scale mount; show 3 decimals below 0.1, 2 otherwise.
	const fmt = (x) => (x < 0.1 ? x.toFixed(3) : x.toFixed(2));
	for (const op of OPS) {
		const row = [op.padEnd(14)];
		for (const c of cols) {
			const r = all[c][op];
			row.push(`${fmt(r.median)} (min ${fmt(r.min)}, sd ${fmt(r.stddev)})`.padEnd(W));
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
				const base = scoreOf(baseline[op]);
				if (base === 0) {
					console.log(`  ${op.padEnd(14)}   —    (baseline ~0, sub-resolution)`);
					continue;
				}
				const ratio = scoreOf(r[op]) / base;
				const tag = ratio < 0.95 ? '++ faster' : ratio < 1.05 ? '== ~equal' : '-- slower';
				console.log(`  ${op.padEnd(14)} ${ratio.toFixed(2)}x  ${tag}`);
			}
			console.log();
		}

		// Cascade-cost ratio: bump_shallow / bump_deep. Hook frameworks pay ~10x
		// more for shallow than deep (99 cascading renders vs 10). Signal
		// frameworks should pay roughly the same for both. This ratio quantifies
		// the cascade-vs-targeted-update axis the bench was built to expose.
		console.log('cascade ratio (bump_shallow / bump_deep, signal frameworks should be near 1.0):');
		for (const c of cols) {
			const r = all[c];
			const deep = scoreOf(r.bump_deep);
			const ratioStr = deep === 0 ? '—' : (scoreOf(r.bump_shallow) / deep).toFixed(2) + 'x';
			console.log(`  ${c.padEnd(14)} ${ratioStr}  (hooks expect ~10x, signals ~1x)`);
		}

		// Coalescing benefit: batched (1 flush) vs per-bump (10 flushes) for the
		// same 10 mutations. <1 means batching is cheaper; the further below 1, the
		// more the framework's queue saves by committing once instead of per write.
		console.log(
			'\ncoalescing ratio (bump_sweep_batched / bump_sweep, lower = bigger win from batching):',
		);
		for (const c of cols) {
			const r = all[c];
			const perOp = scoreOf(r.bump_sweep);
			const ratioStr = perOp === 0 ? '—' : (scoreOf(r.bump_sweep_batched) / perOp).toFixed(2) + 'x';
			console.log(`  ${c.padEnd(14)} ${ratioStr}`);
		}

		// Order-sensitivity: descendant-first vs ancestor-first for the SAME batched
		// flush. A scheduler that coalesces overlapping cascades only in queue order
		// pays more when updates arrive deepest-first (>1); one that drains in tree
		// order — and signal frameworks, which don't cascade — stay ~1.0. This is the
		// metric the reverse sweep was added to expose. Reported on means (the medians
		// are at the ~0.1ms timer-quantization floor for these sub-ms ops).
		console.log(
			'\norder-sensitivity ratio (bump_sweep_reverse / bump_sweep_batched, ~1.0 = order-independent):',
		);
		for (const c of cols) {
			const r = all[c];
			const fwd = r.bump_sweep_batched.mean;
			const ratioStr = !fwd ? '—' : (r.bump_sweep_reverse.mean / fwd).toFixed(2) + 'x';
			console.log(`  ${c.padEnd(14)} ${ratioStr}  (on means)`);
		}
	}

	// Machine-readable results for the unified bench runner (see the BENCH_JSON
	// contract in benchmarks/README.md): milliseconds, one ops map per target.
	if (process.env.BENCH_JSON) {
		const payload = {
			suite: 'signal-favoring',
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
