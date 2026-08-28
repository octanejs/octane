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
import { censusDomNodes, deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
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
		// Conditional JSX returns now compile to template control flow, so the
		// routed subtree's recursive Node never reaches the de-opt renderer
		// (hostElementBody / deoptItemBody are held at ZERO). The remaining
		// createElement/renderBlock headroom over the .tsrx twin is the
		// single-return `_frag` wrapper ABI (one extra block + descriptor per
		// component), which is the next lowering target.
		nav_nested: {
			max: {
				renderBlock: 220,
				unmountBlock: 220,
				createElement: 60,
				childSlot: 10,
				hostElementBody: 0,
				deoptItemBody: 0,
				reconcileKeyed: 0,
			},
		},
		nav_deep: {
			max: {
				renderBlock: 6400,
				createElement: 1200,
				childSlot: 10,
				hostElementBody: 0,
				deoptItemBody: 0,
				reconcileKeyed: 0,
			},
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

async function validateMarkerCensus(browser, target, failures) {
	const context = await browser.newContext();
	const page = await context.newPage();
	try {
		await page.goto(target.url, { waitUntil: 'load' });
		await page.waitForFunction(() => globalThis.__ready === true, null, { timeout: 10_000 });
		await page.evaluate(() => globalThis.__mount('a'));
		const deep = await page.evaluate(censusDomNodes, '#main');
		await page.evaluate(() => {
			globalThis.__markerShell = document.querySelector('.shell');
			globalThis.__markerOutlet = document.querySelector('.outlet');
			globalThis.__navigate('a/x');
		});
		const nested = await page.evaluate(censusDomNodes, '#main');
		const retained = await page.evaluate(() => ({
			shell: globalThis.__markerShell === document.querySelector('.shell'),
			outlet: globalThis.__markerOutlet === document.querySelector('.outlet'),
			leaves: document.querySelectorAll('.leaf').length,
		}));
		if (deep.elements !== 2052 || deep.text !== 1025) {
			failures.push(`${target.name}.deep: visible DOM changed to ${deep.elements}/${deep.text}`);
		}
		if (nested.elements !== 70 || nested.text !== 33 || retained.leaves !== 32) {
			failures.push(
				`${target.name}.nested: visible DOM changed to ${nested.elements}/${nested.text}/${retained.leaves}`,
			);
		}
		if (!retained.shell || !retained.outlet) {
			failures.push(`${target.name}.nested: navigation replaced its surviving shell or outlet`);
		}
		// Root-suspension transactions need an exact replaceable range for the
		// nested arm: one switch pair in TSRX and one component pair in JSX. The
		// visible tree and surviving shell/outlet identities remain gated above.
		const deepCeiling = target.name === 'octane-tsrx' ? 1 : 0;
		const nestedCeiling = target.name === 'octane-tsrx' ? 4 : 2;
		if (deep.comments > deepCeiling) {
			failures.push(`${target.name}.comments_deep: ${deep.comments} exceeds ${deepCeiling}`);
		}
		if (nested.comments > nestedCeiling) {
			failures.push(`${target.name}.comments_nested: ${nested.comments} exceeds ${nestedCeiling}`);
		}
		return { deep, nested };
	} finally {
		await context.close();
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
			byTarget[target.name] = { dom: await validateMarkerCensus(browser, target, failures) };
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
	console.log('\nProduction DOM census (deep elements/text/comments; nested comments):');
	for (const target of TARGETS) {
		const { deep, nested } = byTarget[target.name].dom;
		console.log(
			`  ${target.name}: ${deep.elements}/${deep.text}/${deep.comments}; nested ${nested.comments}`,
		);
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
