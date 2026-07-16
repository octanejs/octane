// Deterministic, untimed work gate for Octane's production TSRX target.
//
// This deliberately uses Chromium precise call coverage after compilation,
// rather than source-level counters inside RowsA/@for. Observable mutations in
// the candidate region would correctly disqualify autoMemo's purity proof and
// turn the measurement into a different program.
//
// Build unminified (`MEMO_WALL_WORK=1`) and start the production preview first:
//   MEMO_WALL_WORK=1 pnpm --filter octane-tsrx-memowall-bench build
//   pnpm --filter octane-tsrx-memowall-bench preview
//   pnpm --dir benchmarks/memo-wall bench:work

import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.TARGET_URL || 'http://localhost:5206/';
const ROWS = 1000;
const METRICS = [
	'RowsA',
	'updateSurvivor',
	'itemBody',
	'buildValueRows',
	'createElement',
	'shallowEqualProps',
	'RowImpl',
	'InnerImpl',
	'Leaf',
];

const OPS = [
	{
		name: 'mount',
		hook: null,
		expect: {
			RowsA: 1,
			updateSurvivor: 0,
			itemBody: ROWS,
			buildValueRows: 1,
			createElement: ROWS,
			shallowEqualProps: 0,
			RowImpl: ROWS * 2,
			InnerImpl: ROWS * 2,
			Leaf: ROWS * 2,
		},
	},
	{
		name: 'equal_A',
		hook: '__tickA',
		expect: {
			RowsA: 0,
			updateSurvivor: 0,
			itemBody: 0,
			buildValueRows: 0,
			createElement: 0,
			shallowEqualProps: 0,
			RowImpl: 0,
			InnerImpl: 0,
			Leaf: 0,
		},
	},
	{
		name: 'one_change_A',
		hook: '__oneChangeA',
		expect: {
			RowsA: 1,
			updateSurvivor: ROWS,
			itemBody: 1,
			buildValueRows: 0,
			createElement: 0,
			shallowEqualProps: 2,
			RowImpl: 1,
			InnerImpl: 1,
			Leaf: 1,
		},
	},
	{
		name: 'context_A',
		hook: '__ctxA',
		expect: {
			RowsA: 0,
			updateSurvivor: 0,
			itemBody: 0,
			buildValueRows: 0,
			createElement: 0,
			shallowEqualProps: 0,
			RowImpl: 0,
			InnerImpl: 0,
			Leaf: ROWS,
		},
	},
	{
		name: 'one_change_B',
		hook: '__oneChangeB',
		expect: {
			RowsA: 0,
			updateSurvivor: ROWS,
			itemBody: 0,
			buildValueRows: 1,
			createElement: ROWS,
			shallowEqualProps: ROWS + 1,
			RowImpl: 1,
			InnerImpl: 1,
			Leaf: 1,
		},
	},
	{
		name: 'context_B',
		hook: '__ctxB',
		expect: {
			RowsA: 0,
			updateSurvivor: 0,
			itemBody: 0,
			buildValueRows: 0,
			createElement: 0,
			shallowEqualProps: 0,
			RowImpl: 0,
			InnerImpl: 0,
			Leaf: ROWS,
		},
	},
	{
		name: 'equal_B_control',
		hook: '__tickB',
		expect: {
			RowsA: 0,
			updateSurvivor: 0,
			itemBody: 0,
			buildValueRows: 0,
			createElement: 0,
			shallowEqualProps: 0,
			RowImpl: 0,
			InnerImpl: 0,
			Leaf: 0,
		},
	},
];

function callCounts(coverage) {
	const counts = Object.fromEntries(METRICS.map((name) => [name, 0]));
	for (const script of coverage.result) {
		if (!script.url.includes('/assets/')) continue;
		for (const fn of script.functions) {
			if (fn.functionName.startsWith('__item$')) {
				counts.itemBody += fn.ranges[0]?.count ?? 0;
			}
			if (Object.prototype.hasOwnProperty.call(counts, fn.functionName)) {
				counts[fn.functionName] += fn.ranges[0]?.count ?? 0;
			}
		}
	}
	return counts;
}

async function measure(browser, op) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send('Profiler.enable');
	await cdp.send('Profiler.startPreciseCoverage', {
		callCount: true,
		detailed: true,
		allowTriggeredUpdates: false,
	});
	await page.goto(URL, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	// Discard module initialization so the mount row describes only __mount().
	await cdp.send('Profiler.takePreciseCoverage');
	await page.evaluate(async () => {
		const result = window.__mount();
		if (result && typeof result.then === 'function') await result;
	});
	if (op.hook !== null) {
		// Non-mount rows describe one update after a clean committed mount.
		await cdp.send('Profiler.takePreciseCoverage');
		await page.evaluate(async (hook) => {
			const result = window[hook]();
			if (result && typeof result.then === 'function') await result;
		}, op.hook);
	}
	const coverage = await cdp.send('Profiler.takePreciseCoverage');
	await cdp.send('Profiler.stopPreciseCoverage');
	await cdp.send('Profiler.disable');
	await context.close();
	return callCounts(coverage);
}

// Keep helper-call attribution stable. Optimized/inlined functions can disappear
// from precise coverage after the mount warmup even though their bodies execute.
const browser = await chromium.launch({
	headless: true,
	args: ['--no-sandbox', '--js-flags=--jitless'],
});
const results = {};
const failures = [];
try {
	for (const op of OPS) {
		const counts = await measure(browser, op);
		results[op.name] = counts;
		for (const metric of METRICS) {
			if (counts[metric] !== op.expect[metric]) {
				failures.push(`${op.name}.${metric}: ${counts[metric]} !== expected ${op.expect[metric]}`);
			}
		}
	}
} finally {
	await browser.close();
}

console.log(
	'Operation       | RowsA | survivors | item body | buildB | descriptors | memo cmp | Row/Inner/Leaf',
);
console.log(
	'----------------+-------+-----------+-----------+--------+-------------+----------+---------------',
);
for (const op of OPS) {
	const c = results[op.name];
	console.log(
		`${op.name.padEnd(15)} | ${String(c.RowsA).padStart(5)} | ${String(c.updateSurvivor).padStart(9)} | ${String(c.itemBody).padStart(9)} | ${String(c.buildValueRows).padStart(6)} | ${String(c.createElement).padStart(11)} | ${String(c.shallowEqualProps).padStart(8)} | ${c.RowImpl}/${c.InnerImpl}/${c.Leaf}`,
	);
}

if (process.env.WORK_JSON) {
	fs.writeFileSync(
		process.env.WORK_JSON,
		JSON.stringify({ suite: 'memo-wall-work', target: URL, results, failures }, null, '\t') + '\n',
	);
}

if (failures.length > 0) {
	console.error(`\n${failures.length} deterministic work gate failure(s):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log('\nAll deterministic work gates passed.');
