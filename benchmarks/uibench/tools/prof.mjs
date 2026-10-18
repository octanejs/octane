// UIbench single-op profiler: CPU self/inclusive time by function and sampled
// allocation by function for one Solid (or any) uibench fixture, driving the
// page exactly like run.mjs does (prepare → settle → gc → run) but with CDP
// Profiler / HeapProfiler attached. Companion to the board workflow in
// solid/documentation/benchmarking-strategy.md ("Profiling a single op").
//
// Build the fixture unminified and serve it first, e.g. from benchmarks/uibench/solid:
//   npx vite build --minify false --outDir dist-prof
//   npx vite preview --outDir dist-prof --port 5347 --strictPort
//
// Usage (from benchmarks/uibench so playwright resolves):
//   node tools/prof.mjs --url=http://localhost:5347/ --case='tree/[500]/[removeLast(1)]' \
//        [--reps=200] [--mode=cpu|alloc|both] [--top=40] [--interval=50] [--json=out.json]
//
// CPU: one Profiler session spans all reps; each rep brackets its __run() with
// two sentinel functions that spin ~0.3 ms so they are guaranteed to be
// sampled, and only the samples between the sentinels are attributed. The
// __prepare() of each rep (which for removeAll is a FULL render) is therefore
// excluded from the numbers.
// Alloc: HeapProfiler sampling is started/stopped around each __run() via CDP,
// so prepare allocations are excluded the same way; profiles are merged by
// call frame.

import { chromium } from 'playwright';
import fs from 'node:fs';

const arg = (name, def) => {
	const a = process.argv.find((x) => x.startsWith(`--${name}=`));
	return a === undefined ? def : a.slice(name.length + 3);
};
const URL = arg('url', 'http://localhost:5347/');
const CASES = arg('case', 'tree/[500]/[removeLast(1)]').split(';');
const REPS = Number(arg('reps', '200'));
const MODE = arg('mode', 'both'); // cpu | alloc | both | time (timing only)
const TOP = Number(arg('top', '40'));
const INTERVAL = Number(arg('interval', '50')); // µs
const JSON_OUT = arg('json', '');
const WARMUP = Number(arg('warmup', '60'));

const JSFLAGS = arg('jsflags', '--expose-gc'); // e.g. --expose-gc,--no-turbo-inlining to un-inline allocation attribution
const browser = await chromium.launch({ headless: true, args: [`--js-flags=${JSFLAGS}`] });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true);
if (!(await page.evaluate(() => window.crossOriginIsolated))) throw new Error('not cross-origin isolated');
await page.evaluate(() => {
	let state = 0x51be11 >>> 0; // same deterministic Math.random as run.mjs
	Math.random = () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
	window.__profStart = function __PROF_START() {
		const t = performance.now();
		while (performance.now() - t < 0.3);
	};
	window.__profEnd = function __PROF_END() {
		const t = performance.now();
		while (performance.now() - t < 0.3);
	};
	window.__settle = () => new Promise((r) => setTimeout(r, 0));
});
await page.evaluate(() => window.__mount());
const cdp = await context.newCDPSession(page);

const shortUrl = (u) => (u ? u.replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '') : '');
const frameKey = (cf) => `${cf.functionName || '(anonymous)'} ${shortUrl(cf.url)}:${cf.lineNumber + 1}`;

async function timeOp(name, reps) {
	// Plain timing with the harness's protocol so the profiled condition can be
	// checked against the board's number.
	return page.evaluate(
		async ({ name, reps }) => {
			const samples = [];
			for (let i = 0; i < reps; i++) {
				await window.__prepare(name);
				await window.__settle();
				if (typeof gc === 'function') gc();
				const t = performance.now();
				await window.__run(name);
				samples.push(performance.now() - t);
			}
			samples.sort((a, b) => a - b);
			return { median: samples[samples.length >> 1], min: samples[0], p90: samples[Math.floor(samples.length * 0.9)] };
		},
		{ name, reps },
	);
}

async function cpuProfile(name, reps) {
	await cdp.send('Profiler.enable');
	await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL });
	await cdp.send('Profiler.start');
	await page.evaluate(
		async ({ name, reps }) => {
			for (let i = 0; i < reps; i++) {
				await window.__prepare(name);
				await window.__settle();
				if (typeof gc === 'function') gc();
				window.__profStart();
				await window.__run(name);
				window.__profEnd();
			}
		},
		{ name, reps },
	);
	const { profile } = await cdp.send('Profiler.stop');
	await cdp.send('Profiler.disable');

	const byId = new Map(profile.nodes.map((n) => [n.id, n]));
	const parent = new Map();
	for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
	const stackHas = (id, fn) => {
		for (let cur = id; cur !== undefined; cur = parent.get(cur)) if (byId.get(cur).callFrame.functionName === fn) return true;
		return false;
	};
	// Window the samples: inside = after a __PROF_START sample until a __PROF_END sample.
	const self = new Map(), incl = new Map();
	let inside = false, windows = 0, totalUs = 0, samplesIn = 0;
	const { samples, timeDeltas } = profile;
	for (let i = 0; i < samples.length; i++) {
		const id = samples[i];
		const dt = timeDeltas[i + 1] ?? 0; // self time ≈ gap to the next sample
		const node = byId.get(id);
		// The sentinels spin on performance.now(), so their samples have `now`
		// as the leaf and the sentinel below it — test the whole stack, not the
		// leaf, or the spin time lands in the window as `now`.
		if (stackHas(id, '__PROF_START')) { if (!inside) { inside = true; windows++; } continue; }
		if (stackHas(id, '__PROF_END')) { inside = false; continue; }
		if (!inside) continue;
		samplesIn++;
		totalUs += dt;
		const k = frameKey(node.callFrame);
		self.set(k, (self.get(k) ?? 0) + dt);
		const seen = new Set();
		for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
			const kk = frameKey(byId.get(cur).callFrame);
			if (seen.has(kk)) continue;
			seen.add(kk);
			incl.set(kk, (incl.get(kk) ?? 0) + dt);
		}
	}
	const perRep = (us) => (us / windows / 1000).toFixed(4);
	const rows = [...self.entries()].sort((a, b) => b[1] - a[1]);
	console.log(`\n== CPU ${name}: ${windows} windows, ${samplesIn} samples, ${perRep(totalUs)} ms/run attributed (interval ${INTERVAL}µs)`);
	console.log('self ms/run  incl ms/run  %self  function');
	for (const [k, us] of rows.slice(0, TOP))
		console.log(`${perRep(us).padStart(11)}  ${perRep(incl.get(k)).padStart(11)}  ${((us / totalUs) * 100).toFixed(1).padStart(5)}  ${k}`);
	// Inclusive view of the known entry points, in one place.
	const watch = [
		'updateKeyedMap', 'disposeChildren', 'runDisposal', 'clearDeps', 'unlinkSubs', 'deleteFromHeap', 'unobserved',
		'insertExpression', 'reconcileArrays', 'cleanChildren', 'normalize', 'normalizeIncomingArray', 'appendNodes',
		'recompute', 'runEffect', 'flush', 'runQueue', 'createOwner', 'createComponent', 'effect', 'memo', 'computed', 'signal',
		'TreeItem', 'TableView', 'TreeView', '(garbage collector)', '(program)', '(idle)',
	];
	console.log('-- inclusive ms/run for watched functions --');
	for (const w of watch) {
		const hits = [...incl.entries()].filter(([k]) => k.startsWith(w + ' '));
		if (hits.length) console.log(`${w.padEnd(24)} ${hits.map(([k, us]) => `${perRep(us)} (${k.split(' ')[1]})`).join('  ')}`);
	}
	return { windows, samplesIn, totalUs, self: Object.fromEntries(rows), incl: Object.fromEntries(incl) };
}

async function allocProfile(name, reps) {
	const merged = new Map(); // frameKey -> { selfBytes, count }
	let totalBytes = 0;
	await cdp.send('HeapProfiler.enable');
	for (let i = 0; i < reps; i++) {
		await page.evaluate(async (name) => { await window.__prepare(name); await window.__settle(); if (typeof gc === 'function') gc(); }, name);
		await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
		await page.evaluate(async (name) => { await window.__run(name); }, name);
		const { profile } = await cdp.send('HeapProfiler.stopSampling');
		const walk = (node, stack) => {
			const k = frameKey(node.callFrame);
			if (node.selfSize) {
				const e = merged.get(k) ?? { bytes: 0, count: 0, stacks: new Map() };
				e.bytes += node.selfSize;
				e.count += node.samples?.length ?? 0;
				totalBytes += node.selfSize;
				const s = stack.slice(-3).join(' < ');
				e.stacks.set(s, (e.stacks.get(s) ?? 0) + node.selfSize);
				merged.set(k, e);
			}
			for (const c of node.children ?? []) walk(c, [...stack, k.split(' ')[0]]);
		};
		walk(profile.head, []);
	}
	await cdp.send('HeapProfiler.disable');
	const rows = [...merged.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
	console.log(`\n== ALLOC ${name}: ${(totalBytes / reps / 1024).toFixed(1)} KB/run sampled (${reps} runs, 256 B interval)`);
	console.log('KB/run   %    function  [top caller chains]');
	for (const [k, e] of rows.slice(0, TOP)) {
		const chains = [...e.stacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s, b]) => `${s} ${(b / reps / 1024).toFixed(1)}K`).join(' | ');
		console.log(`${(e.bytes / reps / 1024).toFixed(2).padStart(6)} ${((e.bytes / totalBytes) * 100).toFixed(1).padStart(5)}  ${k}  [${chains}]`);
	}
	return { totalBytes, perRun: Object.fromEntries(rows.map(([k, e]) => [k, e.bytes / reps])) };
}

const out = {};
for (const name of CASES) {
	// Warm the JIT the way the harness does (its warmup is 2 iterations × case-sized repetitions).
	await page.evaluate(async ({ name, warmup }) => { for (let i = 0; i < warmup; i++) { await window.__prepare(name); await window.__run(name); } }, { name, warmup: WARMUP });
	const timing = await timeOp(name, Math.min(REPS, 100));
	console.log(`\n#### ${name}  [${URL}]  median ${timing.median.toFixed(4)} ms  min ${timing.min.toFixed(4)}  p90 ${timing.p90.toFixed(4)}  (${Math.min(REPS, 100)} timed runs)`);
	out[name] = { timing };
	if (MODE === 'cpu' || MODE === 'both') out[name].cpu = await cpuProfile(name, REPS);
	if (MODE === 'alloc' || MODE === 'both') out[name].alloc = await allocProfile(name, Math.min(REPS, 60));
	if (errors.length) { console.error('browser errors:', errors); process.exitCode = 1; break; }
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
await browser.close();
