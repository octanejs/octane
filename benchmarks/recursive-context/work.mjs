// Deterministic, untimed production-work gate for Octane's TSRX/TSX twins.
// Source counters would change the compiler's purity analysis, so this observes
// the unminified production bundles through Chromium precise call coverage.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
import { collectPreciseCalls } from '../lib/precise-work.mjs';

const TARGETS = [
	{ name: 'octane-tsrx', url: 'http://localhost:5185/' },
	{ name: 'octane-jsx', url: 'http://localhost:5188/' },
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

const OPS = [
	{ name: 'mount', before: [], operation: '__mount' },
	{ name: 'update_root', before: ['__mount'], operation: '__updateRoot' },
	{ name: 'update_partial', before: ['__mount'], operation: '__updatePartial' },
	{ name: 'partial_unmount', before: ['__mount'], operation: '__partialUnmount' },
	{
		name: 'partial_remount',
		before: ['__mount', '__partialUnmount'],
		operation: '__partialRemount',
	},
	{ name: 'unmount', before: ['__mount'], operation: '__unmount' },
];

// Scaffolding is bounded above so later direct-return lowering can reduce it
// without rebaselining this gate. The visible update cardinality is exact.
const GATES = {
	'octane-tsrx': {
		mount: {
			maxFullSlotCalls: 1027,
			maxSlotCalls: 3074,
			max: {
				renderBlock: 4099,
				componentSlot: 2,
				childSlot: 0,
				createElement: 0,
				hostElementBody: 0,
				deoptItemBody: 0,
				reconcileKeyed: 0,
				updateSurvivor: 0,
			},
		},
		update_root: {
			maxFullSlotCalls: 1027,
			maxSlotCalls: 3074,
			max: {
				renderBlock: 4099,
				componentSlot: 2,
				childSlot: 0,
				createElement: 0,
				hostElementBody: 0,
				deoptItemBody: 0,
				reconcileKeyed: 0,
				updateSurvivor: 0,
			},
			exact: { setText: 1024 },
		},
		update_partial: {
			maxFullSlotCalls: 33,
			maxSlotCalls: 95,
			max: {
				renderBlock: 127,
				componentSlot: 1,
				childSlot: 0,
				createElement: 0,
				hostElementBody: 0,
				deoptItemBody: 0,
				reconcileKeyed: 0,
				updateSurvivor: 0,
			},
			exact: { setText: 32 },
		},
		partial_unmount: {
			maxFullSlotCalls: 0,
			maxSlotCalls: 0,
			max: {
				renderBlock: 1,
				componentSlot: 0,
				childSlot: 0,
				createElement: 0,
				hostElementBody: 0,
				deoptItemBody: 0,
				reconcileKeyed: 0,
				updateSurvivor: 0,
				unmountBlock: 126,
				unmountScope: 188,
			},
		},
		partial_remount: {
			maxFullSlotCalls: 33,
			maxSlotCalls: 95,
			max: {
				renderBlock: 127,
				componentSlot: 1,
				childSlot: 0,
				createElement: 0,
				hostElementBody: 0,
				deoptItemBody: 0,
				reconcileKeyed: 0,
				updateSurvivor: 0,
			},
		},
		unmount: {
			maxFullSlotCalls: 0,
			maxSlotCalls: 0,
			max: { unmountBlock: 4099, unmountScope: 6146 },
		},
	},
	'octane-jsx': {
		mount: {
			maxFullSlotCalls: 2048,
			maxSlotCalls: 3074,
			max: {
				renderBlock: 7168,
				componentSlot: 2048,
				childSlot: 4096,
				createElement: 5121,
				hostElementBody: 1023,
				deoptItemBody: 2046,
				reconcileKeyed: 1023,
				updateSurvivor: 0,
			},
		},
		update_root: {
			maxFullSlotCalls: 2048,
			maxSlotCalls: 3074,
			max: {
				renderBlock: 7168,
				componentSlot: 2048,
				childSlot: 4096,
				createElement: 5121,
				hostElementBody: 1023,
				deoptItemBody: 2046,
				reconcileKeyed: 1023,
				updateSurvivor: 2046,
			},
			exact: { setText: 1024 },
		},
		update_partial: {
			maxFullSlotCalls: 64,
			maxSlotCalls: 95,
			max: {
				renderBlock: 221,
				componentSlot: 64,
				childSlot: 125,
				createElement: 158,
				hostElementBody: 31,
				deoptItemBody: 62,
				reconcileKeyed: 31,
				updateSurvivor: 62,
			},
			exact: { setText: 32 },
		},
		partial_unmount: {
			maxFullSlotCalls: 0,
			maxSlotCalls: 0,
			max: {
				renderBlock: 1,
				componentSlot: 0,
				childSlot: 1,
				createElement: 0,
				hostElementBody: 0,
				deoptItemBody: 0,
				reconcileKeyed: 0,
				updateSurvivor: 0,
				unmountBlock: 220,
				unmountScope: 220,
			},
		},
		partial_remount: {
			maxFullSlotCalls: 64,
			maxSlotCalls: 95,
			max: {
				renderBlock: 221,
				componentSlot: 64,
				childSlot: 125,
				createElement: 158,
				hostElementBody: 31,
				deoptItemBody: 62,
				reconcileKeyed: 31,
				updateSurvivor: 0,
			},
		},
		unmount: {
			maxFullSlotCalls: 0,
			maxSlotCalls: 0,
			max: { unmountBlock: 7168, unmountScope: 7168 },
		},
	},
};

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const METRIC_NAMES = new Set(METRICS);
const AGGREGATED_SLOT_METRICS = new Set(['componentSlotVoid', 'componentSlotLite']);

function validate(target, op, counts, failures) {
	const gate = GATES[target][op];
	for (const [kind, configured] of [
		['max', gate.max ?? {}],
		['exact', gate.exact ?? {}],
	]) {
		for (const [metric, value] of Object.entries(configured)) {
			if (
				!METRIC_NAMES.has(metric) ||
				AGGREGATED_SLOT_METRICS.has(metric) ||
				!Number.isFinite(value)
			) {
				failures.push(`${target}.${op}.${kind}: invalid ${metric}=${String(value)}`);
			}
		}
	}
	for (const metric of Object.keys(gate.exact ?? {})) {
		if (hasOwn(gate.max ?? {}, metric)) {
			failures.push(`${target}.${op}.${metric}: configured as both max and exact`);
		}
	}
	if (!Number.isFinite(gate.maxFullSlotCalls) || !Number.isFinite(gate.maxSlotCalls)) {
		failures.push(`${target}.${op}: missing finite aggregate slot ceilings`);
	}
	for (const metric of ['componentSlot', ...AGGREGATED_SLOT_METRICS]) {
		if (!hasOwn(counts, metric) || !Number.isFinite(counts[metric])) {
			failures.push(`${target}.${op}.${metric}: missing finite coverage count`);
			return;
		}
	}
	const fullSlotCalls = counts.componentSlot + counts.componentSlotVoid;
	const slotCalls = fullSlotCalls + counts.componentSlotLite;
	if (fullSlotCalls > gate.maxFullSlotCalls) {
		failures.push(
			`${target}.${op}.fullSlotCalls: ${fullSlotCalls} exceeds ceiling ${gate.maxFullSlotCalls}`,
		);
	}
	if (slotCalls > gate.maxSlotCalls) {
		failures.push(`${target}.${op}.slotCalls: ${slotCalls} exceeds ceiling ${gate.maxSlotCalls}`);
	}
	for (const metric of METRICS) {
		if (AGGREGATED_SLOT_METRICS.has(metric)) continue;
		if (!hasOwn(counts, metric) || !Number.isFinite(counts[metric])) {
			failures.push(`${target}.${op}.${metric}: missing finite coverage count`);
			continue;
		}
		if (hasOwn(gate.exact ?? {}, metric)) {
			const expected = gate.exact[metric];
			if (counts[metric] !== expected) {
				failures.push(`${target}.${op}.${metric}: ${counts[metric]} !== expected ${expected}`);
			}
			continue;
		}
		const ceiling = hasOwn(gate.max ?? {}, metric) ? gate.max[metric] : 0;
		if (counts[metric] > ceiling) {
			failures.push(`${target}.${op}.${metric}: ${counts[metric]} exceeds ceiling ${ceiling}`);
		}
	}
}

const browser = await chromium.launch({
	headless: true,
	args: ['--no-sandbox', '--js-flags=--jitless'],
});
const results = {};
const failures = [];
try {
	for (const target of TARGETS) {
		results[target.name] = {};
		for (const op of OPS) {
			const counts = await collectPreciseCalls(browser, {
				url: target.url,
				before: op.before,
				operation: op.operation,
				metrics: METRICS,
			});
			results[target.name][op.name] = counts;
			validate(target.name, op.name, counts, failures);
		}
	}
} finally {
	await browser.close();
}

console.log(
	'Operation                 | render | full | void | lite | child | descriptors | host/deopt/keyed/survivors | text | unmount block/scope',
);
console.log(
	'--------------------------+--------+------+------+------+-------+-------------+----------------------------+------+--------------------',
);
for (const target of TARGETS) {
	for (const op of OPS) {
		const c = results[target.name][op.name];
		console.log(
			`${`${target.name}.${op.name}`.padEnd(25)} | ${String(c.renderBlock).padStart(6)} | ${String(c.componentSlot).padStart(4)} | ${String(c.componentSlotVoid).padStart(4)} | ${String(c.componentSlotLite).padStart(4)} | ${String(c.childSlot).padStart(5)} | ${String(c.createElement).padStart(11)} | ${c.hostElementBody}/${c.deoptItemBody}/${c.reconcileKeyed}/${c.updateSurvivor} | ${String(c.setText).padStart(4)} | ${c.unmountBlock}/${c.unmountScope}`,
		);
	}
}

const outputPath = process.env.BENCH_JSON || process.env.WORK_JSON;
if (outputPath) {
	const payload = {
		suite: 'recursive-context-work',
		targets: TARGETS.map((target) => ({
			name: `${target.name}-work`,
			ops: Object.fromEntries(
				OPS.flatMap((op) =>
					METRICS.map((metric) => [
						`${op.name}_${metric}`,
						deterministicStatForJson(deterministicCount(results[target.name][op.name][metric])),
					]),
				),
			),
			meta: {
				gates: failures.some((failure) => failure.startsWith(`${target.name}.`)) ? 'fail' : 'pass',
			},
		})),
	};
	if (failures.length > 0) payload.failed = failures.join('; ');
	fs.writeFileSync(outputPath, JSON.stringify(payload, null, '\t') + '\n');
}

if (failures.length > 0) {
	console.error(`\n${failures.length} deterministic work gate failure(s):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log('\nAll deterministic work gates passed.');
