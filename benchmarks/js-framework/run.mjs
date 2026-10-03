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
import { deterministicCount } from '../lib/dom-nodes.mjs';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import {
	CANONICAL_OPS,
	DIRECT_LIST_MOUNTS,
	ROW_COUNT,
	ensureState,
	seedRandom,
	sleep,
	timeClick,
	verifyDirectListMount,
	verifySelection,
} from './operations.mjs';

// Opt-in diagnostic matching the older 1k clear comparison. Keep the canonical
// 10k suite and its historical baseline unchanged.
const CLEAR_1K = process.env.CLEAR_1K === '1';
const ITER = parseInt(process.argv[2] || (CLEAR_1K ? '15' : '8'), 10);
const WARMUP = CLEAR_1K ? 5 : 3;
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE || 1);
if (!Number.isFinite(CPU_THROTTLE) || CPU_THROTTLE < 1) {
	throw new Error('CPU_THROTTLE must be a number >= 1');
}

const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5176/', ready: '#run' },
			{ name: 'octane-jsx', url: 'http://localhost:5177/', ready: '#run' },
			{ name: 'react', url: 'http://localhost:5175/', ready: '#run' },
			{ name: 'ripple', url: 'http://localhost:5178/', ready: '#run' },
			{ name: 'solid', url: 'http://localhost:5179/', ready: '#run' },
			{ name: 'vue-vapor', url: 'http://localhost:5180/', ready: '#run' },
			{ name: 'preact', url: 'http://localhost:5260/', ready: '#run' },
			{ name: 'svelte', url: 'http://localhost:5271/', ready: '#run' },
			{ name: 'inferno', url: 'http://localhost:5320/', ready: '#run' },
		];

const OPS = CLEAR_1K ? [{ name: 'clear_1k', pre: 'rows', click: '#clear' }] : CANONICAL_OPS;

// Minified production bundles rename runtime helpers, so count all production
// calls instead of pinning private aliases. A separate --jitless browser keeps
// precise call coverage deterministic without affecting wall-clock samples.
async function countProductionMountCalls(target) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--js-flags=--jitless'],
	});
	const context = await browser.newContext();
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	let profiling = false;
	try {
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', {
			callCount: true,
			detailed: true,
			allowTriggeredUpdates: false,
		});
		profiling = true;
		await page.goto(target.url, { waitUntil: 'load' });
		await page.waitForSelector(target.ready, { timeout: 10000 });
		await cdp.send('Profiler.takePreciseCoverage');
		await page.evaluate(async () => {
			document.getElementById('run').click();
			if (window.__benchFlush) await window.__benchFlush();
		});
		const coverage = await cdp.send('Profiler.takePreciseCoverage');
		let calls = 0;
		const functions = [];
		for (const script of coverage.result) {
			if (!script.url.includes('/assets/')) continue;
			for (const fn of script.functions) {
				const count = fn.ranges[0]?.count || 0;
				calls += count;
				if (count > 0) functions.push({ name: fn.functionName || '(anonymous)', count });
			}
		}
		if (calls === 0) throw new Error('mount gate: no production asset call coverage');

		await page.evaluate(async (expectedRows) => {
			const rows = Array.from(document.querySelectorAll('tbody tr'));
			if (rows.length !== expectedRows) {
				throw new Error(`mount gate: profiled mount produced ${rows.length} rows`);
			}
			const first = Number(rows[0].firstElementChild?.textContent);
			for (let index = 0; index < rows.length; index++) {
				if (Number(rows[index].firstElementChild?.textContent) !== first + index) {
					throw new Error(`mount gate: profiled row order changed at ${index}`);
				}
			}
			const row = rows[4];
			row.querySelector('td:nth-child(2) a').click();
			if (window.__benchFlush) await window.__benchFlush();
			const selected = document.querySelectorAll('tbody tr.danger');
			if (selected.length !== 1 || selected[0] !== row) {
				throw new Error('mount gate: profiled row event or selection failed');
			}
		}, ROW_COUNT);
		functions.sort((a, b) => b.count - a.count);
		return { calls, functions: functions.slice(0, 12) };
	} finally {
		if (profiling) {
			await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
			await cdp.send('Profiler.disable').catch(() => {});
		}
		await context.close();
		await browser.close();
	}
}

async function runTarget(t) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--js-flags=--expose-gc'],
	});
	const context = await browser.newContext();
	const page = await context.newPage();
	if (CPU_THROTTLE > 1) {
		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
	}
	await page.goto(t.url, { waitUntil: 'load' });
	await page.waitForSelector(t.ready, { timeout: 10000 });
	await seedRandom(page);

	// Warmup — let JIT settle.
	for (let i = 0; i < WARMUP; i++) {
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
			const selector = i % 2 === 1 && op.alternateClick ? op.alternateClick : op.click;
			const dt = await timeClick(page, op, [selector]);
			if (op.alternateClick) await verifySelection(page, selector);
			samples.push(dt);
			await sleep(60);
		}
		results[op.name] = summarizeSamples(samples);
	}

	if (!CLEAR_1K && (t.name === 'octane-tsrx' || t.name === 'octane-jsx')) {
		for (const operation of DIRECT_LIST_MOUNTS) {
			const work = await verifyDirectListMount(page, operation);
			results[`live_inserts_${operation.name}`] = deterministicCount(work.liveParentInsertions);
			results[`fragment_commits_${operation.name}`] = deterministicCount(work.fragmentCommits);
		}

		const production = await countProductionMountCalls(t);
		const calls = production.calls;
		// Root-suspension transactions make a fresh root mount rollback-safe even
		// without an enclosing boundary. Their accepted ordinary-path cost is
		// recorded in packages/octane/audit/root-suspension-performance.md; keep
		// narrow headroom over the post-#833 production-call observations here.
		const ceiling = t.name === 'octane-tsrx' ? 35000 : 50000;
		if (calls > ceiling) {
			throw new Error(
				`mount gate: ${t.name} made ${calls} production calls (maximum ${ceiling}); ` +
					`top functions: ${production.functions.map(({ name, count }) => `${name}=${count}`).join(', ')}`,
			);
		}
		results.production_calls_1k = deterministicCount(calls);
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
	for (const [label, op] of [
		['#ins1k', 'live_inserts_1k'],
		['#frag1k', 'fragment_commits_1k'],
		['#ins10k', 'live_inserts_10k'],
		['#frag10k', 'fragment_commits_10k'],
		['#calls1k', 'production_calls_1k'],
		['#insadd', 'live_inserts_append_1k'],
		['#inspre', 'live_inserts_prepend_100'],
		['#insapp', 'live_inserts_append_100'],
		['#insmid', 'live_inserts_middle_100'],
	]) {
		if (!cols.some((name) => all[name][op])) continue;
		const row = [label.padEnd(8)];
		for (const name of cols) row.push(String(all[name][op]?.median ?? '-').padEnd(W));
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
			console.log(`${t.name} / ${baselineName} ratio (score; <1 means ${t.name} faster):`);
			for (const op of OPS) {
				const ratio = scoreOf(r[op.name]) / scoreOf(baseline[op.name]);
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
			suite: CLEAR_1K ? 'js-framework-clear-1k' : 'js-framework',
			iterations: ITER,
			targets: TARGETS.map((t) => ({
				name: t.name,
				ops: Object.fromEntries(
					Object.entries(all[t.name]).map(([name, r]) => [
						name,
						r.score == null
							? { median: r.median, min: r.min, samples: r.samples.length }
							: timingStatForJson(r),
					]),
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
