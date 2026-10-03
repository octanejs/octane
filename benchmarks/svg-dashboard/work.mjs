// Deterministic, untimed production-work gate for the octane-tsrx fixture's ui
// commits (tooltip_swarm and pan_zoom).
//
// App hands Viewport its dashboard subtrees as deferred JSX values, so every ui
// commit re-renders Viewport with the identical `defs` and `layers` values and
// classifies them again: `defs` is a deferred component, `layers` a Fragment of
// four deferred components that reconciles as a de-opt list. Each field read of
// a deferred value calls its accessor, which resolves the value's record in the
// current scope. Wall-clock timing cannot isolate how many such reads a commit
// pays, so this counts them in the real production bundle.
//
// Source counters would change the program the compiler sees, so this observes
// an unminified production build through jitless Chromium precise call
// coverage, as recursive-context/work.mjs does. The unified runner finishes the
// timed pass against minified assets first; the preview server then serves the
// rebuilt assets.
//
// Standalone: start the octane-tsrx preview (port 5302), then
//   node benchmarks/svg-dashboard/work.mjs
// SVG_WORK_TARGET='{"name":"octane-tsrx","url":"http://localhost:<port>/"}'
// targets another preview; SVG_WORK_SKIP_BUILD=1 measures its current build.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
import * as sharedOps from './octane-tsrx/src/ops.js';

const TARGET = process.env.SVG_WORK_TARGET
	? JSON.parse(process.env.SVG_WORK_TARGET)
	: { name: 'octane-tsrx', url: 'http://localhost:5302/' };

if (!process.env.SVG_WORK_SKIP_BUILD) {
	execFileSync('pnpm', ['exec', 'vite', 'build', '--minify', 'false'], {
		cwd: fileURLToPath(new URL('./octane-tsrx/', import.meta.url)),
		stdio: 'inherit',
	});
}

// The accessors a deferred JSX value installs for its descriptor fields.
const ACCESSORS = [
	'scopedValueType',
	'scopedValueProps',
	'scopedValueKey',
	'scopedValueRef',
	'scopedValueChildren',
	'scopedValueInvocationSite',
];
// Structural controls: the slot visits each commit still performs. They are
// reported, not budgeted, so a change that skips work legitimately can land.
const CONTROLS = ['renderBlock', 'childSlot', 'deoptItemBody'];
const METRICS = [...ACCESSORS, ...CONTROLS];
// Every ui commit renders Viewport and classifies `defs`. Coverage omits a
// function that ran zero times, so the other metrics are checked by name in
// the bundle source instead: a renamed function would otherwise count as zero.
const MUST_CALL = ['scopedValueType', 'renderBlock', 'childSlot'];

const TOOLTIP_CYCLES = 4;
const PAN_STEPS = 8; // one full preset rotation

// Read budgets for the measured commits. A ui commit reads `defs`' type, key,
// and props once each (3). Each of the four `layers` children reads its type
// and key while its Fragment flattens, its type for its list item, and its type
// and props in its child slot (4 x 5). A commit that renders the tooltip adds
// the portal body's type, key, and props (3), and three of a cycle's four
// commits do: 23 per pan_zoom commit, 4 x 23 + 3 x 3 = 101 per tooltip cycle.
// The runtime before read-once classification paid 85 per pan_zoom commit and
// 352 per tooltip cycle for the same slot visits.
const BUDGET = {
	tooltip_cycle_scoped_reads: 101 * TOOLTIP_CYCLES,
	pan_zoom_scoped_reads: 23 * PAN_STEPS,
};

// Expected ui state after each measured step, replayed through the shared ops
// module the fixture executes. Measurement starts after one warm cycle/rotation.
function expectedUi() {
	sharedOps.reset();
	for (let i = 0; i < 4; i++) sharedOps.tooltipStep();
	const tooltips = [];
	for (let i = 0; i < TOOLTIP_CYCLES * 4; i++) {
		sharedOps.tooltipStep();
		const t = sharedOps.snapshotForGates().ui.tooltip;
		tooltips.push(t === null ? null : { transform: t.transform, title: t.title });
	}
	sharedOps.reset();
	for (let i = 0; i < PAN_STEPS; i++) sharedOps.panZoomStep();
	const pans = [];
	for (let i = 0; i < PAN_STEPS; i++) {
		sharedOps.panZoomStep();
		const { viewBox, rootTransform } = sharedOps.snapshotForGates().ui;
		pans.push({ viewBox, rootTransform });
	}
	sharedOps.reset();
	return { tooltips, pans };
}

function countNamed(coverage) {
	const counts = Object.fromEntries(METRICS.map((name) => [name, 0]));
	const assets = new Set();
	let productionCalls = 0;
	for (const script of coverage.result) {
		if (!script.url.includes('/assets/')) continue;
		assets.add(script.url);
		for (const fn of script.functions) {
			productionCalls += fn.ranges[0]?.count ?? 0;
			if (Object.hasOwn(counts, fn.functionName)) {
				counts[fn.functionName] += fn.ranges[0]?.count ?? 0;
			}
		}
	}
	if (productionCalls === 0) throw new Error('operation produced no production asset calls');
	return { counts, assets };
}

// The page-side operations. Each records, with native DOM reads only, the ui
// state after every commit, so the semantic record cannot add production calls.
const OPERATIONS = {
	tooltip_cycle: {
		warm: () => {
			for (let i = 0; i < 4; i++) window.__tooltipStep();
		},
		run: (steps) => {
			const states = [];
			for (let i = 0; i < steps; i++) {
				window.__tooltipStep();
				const tip = document.querySelector('g.overlay .tooltip');
				states.push(
					tip === null
						? null
						: {
								transform: tip.getAttribute('transform'),
								title: tip.querySelector('.tt-title').textContent,
							},
				);
			}
			return states;
		},
		steps: TOOLTIP_CYCLES * 4,
		expected: (ui) => ui.tooltips,
	},
	pan_zoom: {
		warm: () => {
			for (let i = 0; i < 8; i++) window.__panZoomStep();
		},
		run: (steps) => {
			const states = [];
			for (let i = 0; i < steps; i++) {
				window.__panZoomStep();
				states.push({
					viewBox: document.querySelector('svg.dash').getAttribute('viewBox'),
					rootTransform: document.querySelector('g.root').getAttribute('transform'),
				});
			}
			return states;
		},
		steps: PAN_STEPS,
		expected: (ui) => ui.pans,
	},
};

// The deferred subtrees must stay mounted: a remount would also skip the reads
// this gate counts, so DOM identity is part of the control.
function holdSubtrees() {
	window.__workHeld = ['defs', 'g.topology', 'g.charts', 'g.sparks', 'g.icons'].map((selector) =>
		document.querySelector(selector),
	);
	return window.__workHeld.every((node) => node !== null);
}
function subtreesHeld() {
	return ['defs', 'g.topology', 'g.charts', 'g.sparks', 'g.icons'].every(
		(selector, index) => document.querySelector(selector) === window.__workHeld[index],
	);
}

async function measure(browser, name, operation, ui) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	let profiling = false;
	try {
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', {
			callCount: true,
			detailed: true,
			allowTriggeredUpdates: false,
		});
		profiling = true;
		await page.goto(TARGET.url, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
		await page.evaluate(() => {
			window.__reset();
			window.__mount();
		});
		await page.evaluate(`(${operation.warm})()`);
		if (!(await page.evaluate(holdSubtrees))) throw new Error(`${name}: dashboard did not mount`);
		await cdp.send('Profiler.takePreciseCoverage');
		const states = await page.evaluate(`(${operation.run})(${operation.steps})`);
		const { counts, assets } = countNamed(await cdp.send('Profiler.takePreciseCoverage'));

		const failures = [];
		const source = (
			await Promise.all([...assets].map((url) => fetch(url).then((response) => response.text())))
		).join('\n');
		for (const metric of METRICS) {
			if (!source.includes(`function ${metric}(`)) {
				failures.push(`${name}: ${metric} is not a named function in the production bundle`);
			}
		}
		for (const metric of MUST_CALL) {
			if (counts[metric] === 0)
				failures.push(`${name}: the measured commits never called ${metric}`);
		}
		if (JSON.stringify(states) !== JSON.stringify(operation.expected(ui))) {
			failures.push(
				`${name}: ui states ${JSON.stringify(states)} differ from the shared ops replay`,
			);
		}
		if (!(await page.evaluate(subtreesHeld))) {
			failures.push(`${name}: a deferred dashboard subtree was remounted`);
		}
		if (errors.length > 0) failures.push(`${name}: browser errors: ${errors.join('; ')}`);
		return { counts, failures };
	} finally {
		if (profiling) {
			await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
			await cdp.send('Profiler.disable').catch(() => {});
		}
		await context.close();
	}
}

const ui = expectedUi();
const failures = [];
const ops = {};
const browser = await chromium.launch({
	headless: true,
	args: ['--disable-extensions', '--no-sandbox', '--js-flags=--jitless'],
});
try {
	for (const [name, operation] of Object.entries(OPERATIONS)) {
		const result = await measure(browser, name, operation, ui);
		failures.push(...result.failures);
		const reads = ACCESSORS.reduce((sum, metric) => sum + result.counts[metric], 0);
		ops[`${name}_scoped_reads`] = reads;
		for (const metric of METRICS) ops[`${name}_${metric}`] = result.counts[metric];
		console.log(
			`${TARGET.name} ${name} (${operation.steps} commits): ${reads} scoped reads ` +
				JSON.stringify(result.counts),
		);
	}
} catch (error) {
	failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
	await browser.close();
}

const stat = (value) => deterministicStatForJson(deterministicCount(value));
if (process.env.BENCH_JSON) {
	const payload = {
		suite: 'svg-dashboard-work',
		targets: [
			{
				name: `${TARGET.name}-work`,
				ops: Object.fromEntries(Object.entries(ops).map(([op, value]) => [op, stat(value)])),
				meta: { gates: failures.length > 0 ? 'fail' : 'pass' },
			},
			{
				name: `${TARGET.name}-work-budget`,
				ops: Object.fromEntries(Object.entries(BUDGET).map(([op, value]) => [op, stat(value)])),
				meta: { tooltipCycles: TOOLTIP_CYCLES, panSteps: PAN_STEPS },
			},
		],
	};
	if (failures.length > 0) payload.failed = failures.join('; ');
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}

if (failures.length > 0) {
	console.error(`\n${failures.length} svg-dashboard work gate failure(s):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exitCode = 1;
} else {
	console.log('All svg-dashboard work gates passed.');
}
