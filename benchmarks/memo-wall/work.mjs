// Deterministic, untimed work gate for Octane's production TSRX target.
// Set WORK_DIALECT=jsx to check the equivalent return-JSX production target.
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

const DIALECT = process.env.WORK_DIALECT || 'tsrx';
if (DIALECT !== 'tsrx' && DIALECT !== 'jsx') {
	throw new Error(`Unsupported WORK_DIALECT ${JSON.stringify(DIALECT)}; expected "tsrx" or "jsx".`);
}
const URL = process.env.TARGET_URL || `http://localhost:${DIALECT === 'jsx' ? 5207 : 5206}/`;
const ROWS = 1000;
const METRICS = [
	'RowsA',
	'updateSurvivor',
	'itemBody',
	'buildValueRows',
	'createElement',
	'shallowEqualProps',
	'restampCachedContextScope',
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
	// Wall B's imported helper is cached against its `items` argument by
	// production auto-calculation. Equal/context-only parent updates reuse that
	// descriptor array. Both dialects must also skip the proven-immutable
	// renderable region, while context updates refresh existing leaf consumers.
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

// Return-JSX components keep their public descriptor ABI, so their wrapper
// allocations differ from TSRX even when both dialects do the same keyed-list
// work. Keep the consumer-visible bodies and the optimized list work exact:
// an unchanged wall must visit no keyed survivors, while a changed item must
// visit the survivors but run exactly one item/row/inner/leaf body.
const JSX_EXPECTATIONS = {
	mount: { createElement: 11007 },
	equal_A: { RowsA: 0, createElement: 1 },
	one_change_A: { createElement: 8 },
	context_A: { RowsA: 0, createElement: ROWS + 1 },
	one_change_B: { createElement: ROWS + 6 },
	context_B: {
		updateSurvivor: 0,
		buildValueRows: 0,
		createElement: ROWS + 1,
		shallowEqualProps: 0,
	},
	equal_B_control: {
		updateSurvivor: 0,
		buildValueRows: 0,
		createElement: 1,
		shallowEqualProps: 0,
	},
};

// Wrapper descriptors are implementation work, not a required public effect.
// These ceilings allow equivalent returned-JSX output to allocate fewer while
// keeping row/context execution and keyed-list visits exact.
const JSX_MAXIMUMS = {
	equal_A: { createElement: 1 },
	context_A: { createElement: ROWS + 1 },
	context_B: { createElement: ROWS + 1 },
	equal_B_control: { createElement: 1 },
};

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
		const expected = {
			...op.expect,
			...(DIALECT === 'jsx' ? JSX_EXPECTATIONS[op.name] : {}),
			// Legacy context-aware list regions must never walk their memoized rows
			// merely because the owning JSX fragment has an implicit-bail ancestor.
			restampCachedContextScope: 0,
		};
		for (const metric of METRICS) {
			const maximum = DIALECT === 'jsx' ? JSX_MAXIMUMS[op.name]?.[metric] : undefined;
			if (maximum !== undefined && counts[metric] > maximum) {
				failures.push(`${op.name}.${metric}: ${counts[metric]} > maximum ${maximum}`);
			} else if (maximum === undefined && counts[metric] !== expected[metric]) {
				failures.push(`${op.name}.${metric}: ${counts[metric]} !== expected ${expected[metric]}`);
			}
		}
	}
} finally {
	await browser.close();
}

console.log(
	'Operation       | RowsA | survivors | item body | buildB | descriptors | memo cmp | restamp | Row/Inner/Leaf',
);
console.log(
	'----------------+-------+-----------+-----------+--------+-------------+----------+---------+---------------',
);
for (const op of OPS) {
	const c = results[op.name];
	console.log(
		`${op.name.padEnd(15)} | ${String(c.RowsA).padStart(5)} | ${String(c.updateSurvivor).padStart(9)} | ${String(c.itemBody).padStart(9)} | ${String(c.buildValueRows).padStart(6)} | ${String(c.createElement).padStart(11)} | ${String(c.shallowEqualProps).padStart(8)} | ${String(c.restampCachedContextScope).padStart(7)} | ${c.RowImpl}/${c.InnerImpl}/${c.Leaf}`,
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
