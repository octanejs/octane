// list-clear bench harness — the keyed-list bulk clear, by PARENT SHAPE.
//
// `batchClearItems` has two shapes to serve. A list that OWNS its parent (the
// `@for` is the only content of its element) can be cleared by emptying the
// parent outright. A list SHARING its parent with interleaved JSX may only
// take the span between its own markers, and there the runtime picks between
// walking the span and a scoped Range by item count — the walk wins while
// Range's fixed setup dominates, Range wins once per-node call overhead does.
//
// Every other suite's `@for` is the sole child of its parent, so until this
// suite existed the shared-parent path had no coverage at all and its strategy
// boundary could move either way unnoticed. The sizes below sit deliberately on
// opposite sides of that boundary: `clear_shared_small` measures the small-list
// strategy and `clear_shared_1000` the large-list one, so moving the boundary
// moves one of these numbers. `clear_owned_1000` is the control — same rows,
// same count, untouched code path.
//
// Methodology mirrors the sibling benches: the whole sample loop runs INSIDE
// one page.evaluate (a CDP round-trip per sample costs more than the op does
// and adds its own jitter), each sample re-populates untimed, yields, forces a
// GC, and times only the clear. Each op clears a GROUP of independent lists so
// the sample clears 1ms comfortably — the runner refuses to call a sub-ms move
// a regression, since timer granularity alone could explain it.
//
// CORRECTNESS GATE (load-bearing): a clear that took the wrong span would look
// FASTER, so before timing each op the harness applies it once and asserts the
// resulting DOM — rows gone, and every shared list left with its lead/tail
// neighbours in order. A gate failure skips that op's timing (driving a fixture
// that cleared the wrong span usually throws) and fails the run.
//
// Server must be running first (production preview recommended):
//   pnpm --filter octane-tsrx-list-clear-bench preview   # :5298
// (swap `preview` → `dev` for the unminified dev build).
//
// Usage:  node run.mjs [iter]   # default 20
// Env:    TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5298/"}]'
//         BENCH_JSON=/path/out.json   # machine-readable results

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ITER = parseInt(process.argv[2] || '20', 10);
const WARMUP = Math.min(8, Math.max(2, ITER));
const YIELD_MS = 5;

const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [{ name: 'octane-tsrx', url: 'http://localhost:5298/' }];

// Each op CONSUMES its populated lists, so the fill re-runs (untimed) before
// every sample. `container` holds the lists the op clears; after it, `li.row`
// must be gone and every list must still carry exactly `survivors`.
const OPS = [
	{
		name: 'clear_shared_small',
		container: '#shared-small',
		pre: '__fillSharedSmall',
		op: '__opClearSharedSmall',
		survivors: ['lead', 'tail'],
	},
	{
		name: 'clear_shared_1000',
		container: '#shared-large',
		pre: '__fillSharedLarge',
		op: '__opClearSharedLarge',
		survivors: ['lead', 'tail'],
	},
	{
		name: 'clear_owned_1000',
		container: '#owned',
		pre: '__fillOwned',
		op: '__opClearOwned',
		survivors: [],
	},
];

/** The DOM a clear must leave behind, across every list in the container. */
const readState = (page, op) =>
	page.evaluate((container) => {
		const lists = Array.from(document.querySelectorAll(`${container} > ul`));
		return {
			lists: lists.length,
			rows: document.querySelectorAll(`${container} li.row`).length,
			survivors: lists.map((ul) =>
				Array.from(ul.children)
					.filter((li) => !li.classList.contains('row'))
					.map((li) => li.className)
					.join(','),
			),
		};
	}, op.container);

const measureOp = (page, op) =>
	page.evaluate(
		async ({ preName, opName, WARMUP, ITER, YIELD_MS }) => {
			const pre = window[preName];
			const fn = window[opName];
			const gc = window.gc || (() => {});
			const yieldTask = () => new Promise((r) => setTimeout(r, YIELD_MS));
			const out = [];
			for (let i = 0; i < WARMUP + ITER; i++) {
				pre();
				await yieldTask();
				gc();
				const t0 = performance.now();
				fn();
				const dt = performance.now() - t0;
				if (i >= WARMUP) out.push(dt);
			}
			return out;
		},
		{ preName: op.pre, opName: op.op, WARMUP, ITER, YIELD_MS },
	);

async function runTarget(target) {
	const browser = await chromium.launch({
		args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'],
	});
	const page = await browser.newPage();
	const failures = [];
	const ops = [];
	try {
		await page.goto(target.url, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 30_000 });
		await page.evaluate(() => window.__mount());
		if (!(await page.evaluate(() => typeof window.gc === 'function'))) {
			console.warn('  ! window.gc unavailable (need --js-flags=--expose-gc) — results noisier');
		}

		for (const op of OPS) {
			// Gate first: a clear that took the wrong span reads as a FASTER one,
			// so the timing below is only meaningful once this holds.
			await page.evaluate((pre) => window[pre](), op.pre);
			await page.evaluate((name) => window[name](), op.op);
			const state = await readState(page, op);
			const wanted = op.survivors.join(',');
			if (state.lists === 0) {
				failures.push(`${target.name}/${op.name}: ${op.container} rendered no lists`);
				continue;
			}
			if (state.rows !== 0 || state.survivors.some((s) => s !== wanted)) {
				failures.push(
					`${target.name}/${op.name}: expected 0 rows and every list left with ` +
						`[${wanted}], got ${state.rows} rows and ${JSON.stringify(state.survivors)}`,
				);
				// Timing a fixture that cleared the wrong span measures nothing, and
				// driving it further usually throws — report the gate and move on.
				continue;
			}
			ops.push({ name: op.name, stat: summarizeSamples(await measureOp(page, op)) });
		}
	} finally {
		await browser.close();
	}
	return { name: target.name, ops, failures };
}

const results = [];
for (const target of TARGETS) {
	process.stdout.write(`→ ${target.name} … `);
	try {
		results.push(await runTarget(target));
		process.stdout.write('done\n');
	} catch (err) {
		// A fixture broken badly enough to throw is a correctness failure, not a
		// crashed run: record it so BENCH_JSON still lands and the runner names
		// the suite rather than reporting "no parseable output".
		process.stdout.write('FAILED\n');
		results.push({ name: target.name, ops: [], failures: [`${target.name}: ${err.message}`] });
	}
}

console.log('\nkeyed-list bulk clear (ms, lower is better)\n');
const width = Math.max(...OPS.map((o) => o.name.length)) + 2;
for (const target of results) {
	console.log(target.name);
	for (const op of target.ops) {
		console.log('  ' + op.name.padEnd(width) + scoreOf(op.stat).toFixed(3) + 'ms');
	}
	console.log();
}

const failures = results.flatMap((r) => r.failures);
for (const failure of failures) console.error('GATE FAILED: ' + failure);

if (process.env.BENCH_JSON) {
	writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify(
			{
				suite: 'list-clear',
				failed: failures.length > 0 ? failures : undefined,
				targets: results.map((target) => ({
					name: target.name,
					ops: Object.fromEntries(target.ops.map((op) => [op.name, timingStatForJson(op.stat)])),
				})),
			},
			null,
			'\t',
		) + '\n',
	);
	console.log(`BENCH_JSON written to ${process.env.BENCH_JSON}`);
}

if (failures.length > 0) process.exit(1);
