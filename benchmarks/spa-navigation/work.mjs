// Deterministic, untimed production-work gate for Octane's TSRX/TSX twins.
// Source counters would change the compiler's purity analysis, so this observes
// the unminified production bundles through Chromium precise call coverage.
//
// This is where a navigation regression gets a name rather than a number: the
// counters say whether a route swap went through compiled block bodies or fell
// back to the runtime de-opt renderer (createElement / childSlot /
// deoptItemBody / reconcileKeyed), and how much of the surviving shell was
// rebuilt on a nested navigation.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
import { collectPreciseCalls } from '../lib/precise-work.mjs';

const TARGETS = [
	{ name: 'octane-tsrx', url: 'http://localhost:5310/' },
	{ name: 'octane-jsx', url: 'http://localhost:5311/' },
];

const METRICS = [
	'renderBlock',
	'componentSlot',
	'componentSlotVoid',
	'componentSlotLite',
	'childSlot',
	'createElement',
	'hostElementBody',
	'deoptItemBody',
	'reconcileKeyed',
	'updateSurvivor',
	'setText',
	'unmountBlock',
	'unmountScope',
];

const mount = (route) => ({ name: '__mount', arg: route });
const nav = (route) => ({ name: '__navigate', arg: route });

const OPS = [
	{ name: 'nav_deep', before: [mount('a')], operation: nav('b') },
	{ name: 'nav_teardown', before: [mount('a')], operation: nav('a/x') },
	{ name: 'nav_mount', before: [mount('a'), nav('a/x')], operation: nav('a') },
	{ name: 'nav_nested', before: [mount('a'), nav('a/x')], operation: nav('a/y') },
];

// Ceilings, not fingerprints: they are set above the observed counts so a later
// lowering can reduce them without a rebaseline, and they fail on the shapes
// that matter: a navigation reaching the de-opt renderer on the TSRX path, or
// a nested navigation touching more than its own 32-leaf section.
const GATES = {
	'octane-tsrx': {
		nav_deep: {
			max: { createElement: 0, childSlot: 0, deoptItemBody: 0, reconcileKeyed: 0 },
		},
		nav_teardown: {
			max: { createElement: 0, childSlot: 0, deoptItemBody: 0, reconcileKeyed: 0 },
		},
		nav_mount: {
			max: { createElement: 0, childSlot: 0, deoptItemBody: 0, reconcileKeyed: 0 },
		},
		nav_nested: {
			max: {
				createElement: 0,
				childSlot: 0,
				deoptItemBody: 0,
				reconcileKeyed: 0,
				// The shell, nav and layout survive: only the 32-leaf section, its 31
				// interior nodes and their directive blocks may be rebuilt or torn
				// down (measured 160/158; the ceiling leaves room to lower it).
				renderBlock: 200,
				unmountBlock: 200,
			},
		},
	},
	'octane-jsx': {
		// The JSX dialect currently reaches the runtime de-opt renderer for the
		// whole routed subtree (see the README): these ceilings stop that getting
		// worse while it is being addressed.
		nav_nested: {
			max: { renderBlock: 260, unmountBlock: 260, createElement: 160, deoptItemBody: 80 },
		},
		nav_deep: {
			max: { renderBlock: 7400, createElement: 4300, deoptItemBody: 2200 },
		},
	},
};

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function validate(target, op, counts, failures) {
	const gate = GATES[target]?.[op];
	if (!gate) return;
	for (const [metric, limit] of Object.entries(gate.max ?? {})) {
		if (!hasOwn(counts, metric)) {
			failures.push(`${target}.${op}: unknown metric ${metric}`);
			continue;
		}
		if (counts[metric] > limit) {
			failures.push(`${target}.${op}: ${metric} ${counts[metric]} exceeds ${limit}`);
		}
	}
	for (const [metric, expected] of Object.entries(gate.exact ?? {})) {
		if (counts[metric] !== expected) {
			failures.push(`${target}.${op}: ${metric} ${counts[metric]} is not ${expected}`);
		}
	}
}

(async () => {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox', '--jitless'],
	});
	const failures = [];
	const rows = [];
	const byTarget = {};
	try {
		for (const target of TARGETS) {
			byTarget[target.name] = {};
			for (const op of OPS) {
				const counts = await collectPreciseCalls(browser, {
					url: target.url,
					before: op.before,
					operation: op.operation,
					metrics: METRICS,
				});
				validate(target.name, op.name, counts, failures);
				byTarget[target.name][op.name] = counts;
				rows.push({ target: target.name, op: op.name, counts });
			}
		}
	} finally {
		await browser.close();
	}

	const W = 26;
	console.log(
		'Operation'.padEnd(W) +
			'| render | full | lite | void | child | createEl | host/deopt/keyed | text | unmount b/s',
	);
	console.log(
		'-'.repeat(W) +
			'+--------+------+------+------+-------+----------+------------------+------+------------',
	);
	for (const { target, op, counts } of rows) {
		console.log(
			`${target}.${op}`.padEnd(W) +
				`| ${String(counts.renderBlock).padStart(6)} ` +
				`| ${String(counts.componentSlot).padStart(4)} ` +
				`| ${String(counts.componentSlotLite).padStart(4)} ` +
				`| ${String(counts.componentSlotVoid).padStart(4)} ` +
				`| ${String(counts.childSlot).padStart(5)} ` +
				`| ${String(counts.createElement).padStart(8)} ` +
				`| ${counts.hostElementBody}/${counts.deoptItemBody}/${counts.reconcileKeyed}`.padEnd(19) +
				`| ${String(counts.setText).padStart(4)} ` +
				`| ${counts.unmountBlock}/${counts.unmountScope}`,
		);
	}

	// The dialect gap is the headline this suite exists to surface: the same app
	// over the same core, authored two ways.
	console.log('\ntsx/tsrx work ratio per operation (renderBlock, lower is closer):');
	for (const op of OPS) {
		const tsrx = byTarget['octane-tsrx']?.[op.name]?.renderBlock;
		const jsx = byTarget['octane-jsx']?.[op.name]?.renderBlock;
		if (tsrx)
			console.log(`  ${op.name.padEnd(13)} ${(jsx / tsrx).toFixed(2)}x  (${tsrx} → ${jsx})`);
	}

	if (process.env.BENCH_JSON) {
		const payload = {
			suite: 'spa-navigation-work',
			targets: TARGETS.map((t) => ({
				name: `${t.name}-work`,
				ops: Object.fromEntries(
					OPS.flatMap((op) =>
						METRICS.map((metric) => [
							`${op.name}_${metric}`,
							deterministicStatForJson(deterministicCount(byTarget[t.name][op.name][metric])),
						]),
					),
				),
				meta: { gates: failures.some((f) => f.startsWith(t.name)) ? 'fail' : 'pass' },
			})),
		};
		if (failures.length > 0) payload.failed = failures.join('; ');
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
		console.error(`BENCH_JSON written to ${process.env.BENCH_JSON}`);
	}

	if (failures.length > 0) {
		console.error(`\n✗ ${failures.length} work-gate failure(s):`);
		for (const failure of failures) console.error(`  - ${failure}`);
		process.exitCode = 1;
	} else {
		console.log('\nAll deterministic work gates passed.');
	}
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
