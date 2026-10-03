// spa-navigation bench harness. Drives every framework fixture via Playwright.
//
// What this measures: a client-side full-page navigation, i.e. tearing down one
// route's component tree and building the next one, with the app shell staying
// mounted. Routers are deliberately NOT part of the fixture: every app holds one
// route signal/state and swaps its outlet, so the numbers are renderer work, not
// a comparison of router libraries.
//
// Four navigations over one tree shape (depth 10 = 1024 leaves; the nested
// section is depth 5 = 32 leaves), chosen so teardown and mount can be read
// apart instead of only in sum:
//
//   nav_deep      'a'   -> 'b'     1024-leaf teardown + 1024-leaf mount
//   nav_teardown  'a'   -> 'a/x'   1024-leaf teardown +   32-leaf mount
//   nav_mount     'a/x' -> 'a'       32-leaf teardown + 1024-leaf mount
//   nav_nested    'a/x' -> 'a/y'     32-leaf teardown +   32-leaf mount, with
//                                  the shell AND the layout surviving
//   nav_deep_6x   nav_deep under 6x CPU throttling (the mobile signal: a
//                                  navigation that is comfortable on a laptop
//                                  can be visibly slow on a phone)
//
// nav_nested is the interesting one. Only the innermost 32-leaf section
// changes, so a framework that reuses the surviving wrappers does ~3% of
// nav_deep's work; one that rebuilds them does far more. The gate below asserts
// the shell and layout survive BY NODE IDENTITY, so "less work" can never mean
// "rebuilt anyway".
//
// Methodology matches the sibling suites: each op mutates the DOM inside its
// adapter call, synchronously where the framework allows it (octane/react via
// flushSync, solid via flush()); vue-vapor has no public sync flush and returns
// nextTick(), so the timed window extends until it settles. GC is forced before
// each timed sample. This times framework JS work, not pixels on screen.
//
// One navigation is 0.3-2 ms, only a few of Chromium's 100 µs clock ticks, so a
// sample is a per-target calibrated run of round trips: each timed `from -> to`
// leg is followed by an untimed return and a task yield, and the sample is the
// summed timed legs (about 20 ms) divided by their count. Chromium jitters its
// clamped clock, so the summed legs stay unbiased. Targets are PAIRED: for each
// op every target's page is open in one browser (each in its own context), and
// every sample round visits all targets in a rotating order, so a ratio guard's
// two sides share the runner's state at the time.
//
// Usage:
//   node run.mjs [iter]   # default 20 (bench:long passes 40)

import { chromium } from 'playwright';
import fs from 'node:fs';
import { censusDomNodes, deterministicCount } from '../lib/dom-nodes.mjs';
import { calibratedReps, roundOrder } from '../lib/paired.mjs';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ITER = parseInt(process.argv[2] || '20', 10);
// Untimed samples per op and target; each already holds many navigations.
const WARMUP = 2;
const YIELD_MS = 5;
const THROTTLE_RATE = 6;
const MAX_LEGS = 200;

const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5310/' },
			{ name: 'octane-jsx', url: 'http://localhost:5311/' },
			{ name: 'react', url: 'http://localhost:5312/' },
			{ name: 'solid', url: 'http://localhost:5313/' },
			{ name: 'vue-vapor', url: 'http://localhost:5314/' },
			{ name: 'inferno', url: 'http://localhost:5328/' },
		];

const NAVS = [
	{ op: 'nav_deep', from: 'a', to: 'b' },
	{ op: 'nav_teardown', from: 'a', to: 'a/x' },
	{ op: 'nav_mount', from: 'a/x', to: 'a' },
	{ op: 'nav_nested', from: 'a/x', to: 'a/y' },
];

const OPS = [...NAVS.map((n) => n.op), 'nav_deep_6x'];

// Deterministic DOM-shape ops from the untimed census of the 1024-leaf route
// (see measureDom): visible elements/text are the semantic control (equivalent
// trees), comment nodes are the marker-elision claim. Ratio-guarded in
// benchmarks/baselines/ratios.json; keep count assertions here, out of the
// correctness suites.
const CENSUS_OPS = ['nodes_deep', 'elements_deep', 'text_deep', 'comments_deep'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summarize(samples, options) {
	return { ...summarizeSamples(samples, options), __samples: samples };
}

async function freshPage(browser, url) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	return { ctx, page };
}

// Untimed fatal gate. Proves both routes render the full tree, that a
// navigation actually replaces the routed subtree, and (the
// load-bearing part) that the shell survives every navigation and the layout survives the
// nested one, by node identity rather than by markup equality.
async function semanticGate(browser, url) {
	const { ctx, page } = await freshPage(browser, url);
	try {
		return await page.evaluate(async () => {
			const errors = [];
			const expect = (condition, message) => {
				if (!condition) errors.push(message);
			};
			const call = async (name, arg) => {
				const fn = window[name];
				if (typeof fn !== 'function') throw new Error(`missing ${name}`);
				const result = fn(arg);
				if (result && typeof result.then === 'function') await result;
			};
			const q = (sel) => document.querySelector(sel);
			const leaves = () => Array.from(document.querySelectorAll('.leaf'));
			const paths = () => leaves().map((leaf) => leaf.textContent ?? '');

			await call('__mount', 'a');
			expect(leaves().length === 1024, `mount rendered ${leaves().length} leaves, expected 1024`);
			expect(
				document.querySelectorAll('.n').length === 1023,
				`mount rendered ${document.querySelectorAll('.n').length} interior nodes, expected 1023`,
			);
			expect(q('[data-page="a"]') !== null, 'mount did not render route a');
			expect(new Set(paths()).size === 1024, 'leaf paths are not unique');
			expect(
				paths().every((path) => /^a[LR]{10}$/.test(path)),
				'route a leaves carry the wrong paths',
			);
			const shell = q('.shell');
			const outlet = q('.outlet');
			expect(shell !== null && outlet !== null, 'mount did not render the shell');

			await call('__navigate', 'b');
			expect(q('.shell') === shell, 'nav_deep replaced the app shell');
			expect(q('.outlet') === outlet, 'nav_deep replaced the outlet');
			expect(q('[data-page="a"]') === null, 'nav_deep left route a mounted');
			expect(q('[data-page="b"]') !== null, 'nav_deep did not render route b');
			expect(leaves().length === 1024, `nav_deep rendered ${leaves().length} leaves`);
			expect(
				paths().every((path) => /^b[LR]{10}$/.test(path)),
				'route b leaves carry the wrong paths',
			);
			expect(
				(q('.outlet')?.getAttribute('data-route') ?? '') === 'b',
				'nav_deep did not update the outlet route attribute',
			);

			await call('__navigate', 'a/x');
			expect(q('.shell') === shell, 'nav_teardown replaced the app shell');
			expect(q('[data-page="b"]') === null, 'nav_teardown left route b mounted');
			expect(leaves().length === 32, `nested route rendered ${leaves().length} leaves`);
			expect(q('[data-section="x"]') !== null, 'nested route did not render section x');
			const layout = q('.layout');
			const innerOutlet = q('.outlet-inner');
			expect(layout !== null && innerOutlet !== null, 'nested route did not render its layout');
			const sectionX = q('[data-section="x"]');

			await call('__navigate', 'a/y');
			expect(q('.shell') === shell, 'nav_nested replaced the app shell');
			expect(q('.layout') === layout, 'nav_nested replaced the shared layout');
			expect(q('.outlet-inner') === innerOutlet, 'nav_nested replaced the shared inner outlet');
			expect(q('[data-section="x"]') === null, 'nav_nested left section x mounted');
			expect(q('[data-section="y"]') !== null, 'nav_nested did not render section y');
			expect(q('[data-section="y"]') !== sectionX, 'nav_nested reused the removed section node');
			expect(leaves().length === 32, `nav_nested rendered ${leaves().length} leaves`);
			expect(
				paths().every((path) => /^y[LR]{5}$/.test(path)),
				'nav_nested leaves carry the wrong paths',
			);

			await call('__navigate', 'a');
			expect(q('.shell') === shell, 'nav_mount replaced the app shell');
			expect(q('.layout') === null, 'nav_mount left the nested layout mounted');
			expect(leaves().length === 1024, `nav_mount rendered ${leaves().length} leaves`);

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

async function measureDom(browser, url) {
	const { ctx, page } = await freshPage(browser, url);
	const call = async (name, arg) => {
		await page.evaluate(
			async ({ hook, value }) => {
				const result = window[hook](value);
				if (result && typeof result.then === 'function') await result;
			},
			{ hook: name, value: arg },
		);
	};
	try {
		await call('__mount', 'a');
		const deep = await page.evaluate(censusDomNodes, '#main');
		await call('__navigate', 'a/x');
		const nested = await page.evaluate(censusDomNodes, '#main');
		return { deep, nested };
	} finally {
		await ctx.close();
	}
}

// One navigation op across every target: mount each target at `from`, then per
// sample time `legs` from -> to navigations, returning to `from` untimed after
// each, so every timed leg starts from the same tree.
async function measureNav(browser, targets, { from, to }, { throttle = 0 } = {}) {
	const states = [];
	try {
		for (const t of targets) {
			const { ctx, page } = await freshPage(browser, t.url);
			states.push({ t, ctx, page, legs: 1, samples: [] });
			if (throttle > 0) {
				const session = await page.context().newCDPSession(page);
				await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });
			}
			await page.evaluate(
				async ({ from, to, YIELD_MS }) => {
					const nav = async (route) => {
						const result = window.__navigate(route);
						if (result && typeof result.then === 'function') await result;
					};
					const result = window.__mount(from);
					if (result && typeof result.then === 'function') await result;
					window.__benchLegs = async (legs) => {
						(window.gc || (() => {}))();
						let total = 0;
						for (let k = 0; k < legs; k++) {
							void document.body?.offsetHeight;
							const t0 = performance.now();
							await nav(to);
							total += performance.now() - t0;
							await new Promise((r) => setTimeout(r, YIELD_MS));
							await nav(from);
							await new Promise((r) => setTimeout(r, YIELD_MS));
						}
						return total / legs;
					};
				},
				{ from, to, YIELD_MS },
			);
		}
		await sleep(50);

		// Legs per sample, per target: two scaling rounds from three legs, so the
		// count comes from navigations that already ran optimized code.
		for (const state of states) {
			await state.page.bringToFront();
			let legs = 3;
			await state.page.evaluate((n) => window.__benchLegs(n), legs);
			for (let round = 0; round < 2; round++) {
				const perLeg = await state.page.evaluate((n) => window.__benchLegs(n), legs);
				legs = calibratedReps(legs, perLeg * legs, MAX_LEGS);
			}
			state.legs = legs;
		}

		for (let i = 0; i < WARMUP + ITER; i++) {
			for (const state of roundOrder(states, i)) {
				await state.page.bringToFront();
				const dt = await state.page.evaluate((n) => window.__benchLegs(n), state.legs);
				if (i >= WARMUP) state.samples.push(dt);
				await sleep(YIELD_MS);
			}
		}
		return new Map(
			states.map((state) => [state.t.name, { stat: summarize(state.samples), legs: state.legs }]),
		);
	} finally {
		for (const state of states) await state.ctx.close();
	}
}

// Semantic gate and DOM census for one target, in its own browser. The timed
// navigations run later, paired across every passing target.
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
				'  ! window.gc unavailable (need --js-flags=--expose-gc), results will be noisier',
			);
		}
		const dom = await measureDom(browser, t.url);

		const results = {};
		results.__dom = dom;
		results.nodes_deep = deterministicCount(dom.deep.total);
		results.elements_deep = deterministicCount(dom.deep.elements);
		results.text_deep = deterministicCount(dom.deep.text);
		results.comments_deep = deterministicCount(dom.deep.comments);
		return { gateErrors: [], results };
	} finally {
		await browser.close();
	}
}

(async () => {
	const all = {};
	const failures = [];
	const failedTargets = new Set();

	for (const t of TARGETS) {
		console.error(`Checking ${t.name} (${t.url}) semantic gate and census…`);
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

	// Timed navigations, paired across every target whose gate passed.
	const timedTargets = TARGETS.filter((t) => all[t.name]);
	if (timedTargets.length > 0) {
		console.error(
			`Timing ${timedTargets.map((t) => t.name).join(', ')} paired × ${ITER} (+${WARMUP} warmup)…`,
		);
		const browser = await chromium.launch({
			headless: true,
			args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'],
		});
		try {
			const runs = [
				...NAVS.map((nav) => ({ op: nav.op, nav, options: {} })),
				{ op: 'nav_deep_6x', nav: NAVS[0], options: { throttle: THROTTLE_RATE } },
			];
			for (const { op, nav, options } of runs) {
				const byTarget = await measureNav(browser, timedTargets, nav, options);
				for (const t of timedTargets) {
					const { stat, legs } = byTarget.get(t.name);
					all[t.name][op] = stat;
					(all[t.name].__legs ??= {})[op] = legs;
				}
				console.error(
					`  → ${op.padEnd(13)} legs/sample ` +
						timedTargets.map((t) => `${t.name}=${all[t.name].__legs[op]}`).join(' '),
				);
			}
		} catch (error) {
			const message = `timed pass: ${error instanceof Error ? error.message : String(error)}`;
			failures.push(message);
			console.error(`  ✗ ${message}`);
			for (const t of timedTargets) {
				failedTargets.add(t.name);
				delete all[t.name];
			}
		} finally {
			await browser.close();
		}
	}

	const successfulTargets = TARGETS.filter((t) => all[t.name]);
	const cols = successfulTargets.map((t) => t.name);
	const W = 30;
	console.log();
	console.log('Op            | ' + cols.map((c) => c.padEnd(W)).join('| '));
	console.log('--------------+-' + cols.map(() => '-'.repeat(W)).join('+-'));
	for (const op of OPS) {
		const row = [op.padEnd(13)];
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
			successfulTargets.find((target) => target.name === 'solid')?.name ??
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
				console.log(`  ${op.padEnd(13)} ${ratio.toFixed(2)}x  ${tag}`);
			}
			console.log();
		}

		// Reuse ratio: a nested navigation swaps 32 of 1024 leaves, so the floor
		// is ~0.03. Close to 1 means the framework is rebuilding the surviving
		// shell and layout instead of reusing them.
		console.log('reuse ratio (nav_nested / nav_deep, lower = more reuse; ideal ~0.03):');
		for (const c of cols) {
			const ratio = scoreOf(all[c].nav_nested) / scoreOf(all[c].nav_deep);
			console.log(`  ${c.padEnd(13)} ${ratio.toFixed(3)}x`);
		}

		// Throttle ratio: how much a 6x slower CPU costs. A framework whose
		// navigation is dominated by JS work degrades roughly linearly.
		console.log('\nthrottle ratio (nav_deep_6x / nav_deep, lower = less CPU-bound):');
		for (const c of cols) {
			const ratio = scoreOf(all[c].nav_deep_6x) / scoreOf(all[c].nav_deep);
			console.log(`  ${c.padEnd(13)} ${ratio.toFixed(2)}x`);
		}

		// Deterministic DOM census of the 1024-leaf route: equal visible
		// elements/text is the semantic control; comments are renderer overhead
		// (Octane's marker-elision claim lives here, not in correctness suites).
		console.log('\nDOM census, 1024-leaf route (elements / text / comments):');
		for (const c of cols) {
			const d = all[c].__dom.deep;
			console.log(`  ${c.padEnd(13)} ${d.elements} / ${d.text} / ${d.comments}`);
		}
	}

	if (process.env.BENCH_JSON) {
		const payload = {
			suite: 'spa-navigation',
			iterations: ITER,
			targets: TARGETS.map((t) => ({
				name: t.name,
				ops: all[t.name]
					? Object.fromEntries([
							...OPS.map((op) => [op, timingStatForJson(all[t.name][op])]),
							...CENSUS_OPS.map((op) => {
								const r = all[t.name][op];
								return [op, { median: r.median, min: r.min, samples: r.samples.length }];
							}),
						])
					: {},
				meta: {
					gates: failedTargets.has(t.name) ? 'fail' : 'pass',
					...(all[t.name]?.__dom ? { dom: all[t.name].__dom } : null),
					...(all[t.name]?.__legs ? { legsPerSample: all[t.name].__legs } : null),
				},
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
