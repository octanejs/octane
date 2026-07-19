// Deterministic, untimed production-work gate for Octane's TSRX/TSX twins.
// Run against the production previews; the normal Vite configs are already
// unminified, and --jitless keeps precise-call-coverage attribution stable.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
import { collectPreciseCalls } from '../lib/precise-work.mjs';

const TARGETS = [
	{ name: 'octane-tsrx', url: 'http://localhost:5190/' },
	{ name: 'octane-jsx', url: 'http://localhost:5194/' },
];

const METRICS = [
	'renderBlock',
	'componentSlot',
	'componentSlotVoid',
	'componentSlotLite',
	'childSlot',
	'createElement',
	'setText',
	'unmountBlock',
	'unmountScope',
];

const OPS = [
	{ name: 'mount', before: [], operation: '__mount' },
	{ name: 'bump_shallow', before: ['__mount'], operation: '__bumpAt1' },
	{ name: 'bump_middle', before: ['__mount'], operation: '__bumpAt51' },
	{ name: 'bump_deep', before: ['__mount'], operation: '__bumpAt91' },
	{ name: 'bump_batched', before: ['__mount'], operation: '__sweepBatched' },
	{ name: 'unmount', before: ['__mount'], operation: '__unmount' },
];

// These are ceilings on scaffolding, not exact implementation pins: every
// planned TSX optimization should make them smaller. Text writes remain exact
// because every update changes a known number of visible counters.
const GATES = {
	'octane-tsrx': {
		mount: {
			maxFullSlotCalls: 18,
			maxSlotCalls: 100,
			max: { renderBlock: 19, componentSlot: 0, childSlot: 10, createElement: 0 },
		},
		bump_shallow: {
			maxFullSlotCalls: 9,
			maxSlotCalls: 91,
			max: { renderBlock: 10, componentSlot: 0, childSlot: 0, createElement: 0 },
			exact: { setText: 1 },
		},
		bump_middle: {
			maxFullSlotCalls: 4,
			maxSlotCalls: 41,
			max: { renderBlock: 5, componentSlot: 0, childSlot: 0, createElement: 0 },
			exact: { setText: 1 },
		},
		bump_deep: {
			maxFullSlotCalls: 0,
			maxSlotCalls: 1,
			max: { renderBlock: 1, componentSlot: 0, childSlot: 0, createElement: 0 },
			exact: { setText: 1 },
		},
		bump_batched: {
			maxFullSlotCalls: 9,
			maxSlotCalls: 91,
			max: { renderBlock: 10, componentSlot: 0, childSlot: 0, createElement: 0 },
			exact: { setText: 10 },
		},
		unmount: {
			maxFullSlotCalls: 0,
			maxSlotCalls: 0,
			max: { unmountBlock: 19, unmountScope: 101 },
		},
	},
	'octane-jsx': {
		mount: {
			maxFullSlotCalls: 101,
			maxSlotCalls: 101,
			max: { renderBlock: 201, componentSlot: 101, childSlot: 109, createElement: 200 },
		},
		bump_shallow: {
			maxFullSlotCalls: 100,
			maxSlotCalls: 100,
			max: { renderBlock: 200, componentSlot: 100, childSlot: 99, createElement: 199 },
			exact: { setText: 1 },
		},
		bump_middle: {
			maxFullSlotCalls: 50,
			maxSlotCalls: 50,
			max: { renderBlock: 100, componentSlot: 50, childSlot: 49, createElement: 99 },
			exact: { setText: 1 },
		},
		bump_deep: {
			maxFullSlotCalls: 10,
			maxSlotCalls: 10,
			max: { renderBlock: 20, componentSlot: 10, childSlot: 9, createElement: 19 },
			exact: { setText: 1 },
		},
		bump_batched: {
			maxFullSlotCalls: 100,
			maxSlotCalls: 100,
			max: { renderBlock: 200, componentSlot: 100, childSlot: 99, createElement: 199 },
			exact: { setText: 10 },
		},
		unmount: {
			maxFullSlotCalls: 0,
			maxSlotCalls: 0,
			max: { unmountBlock: 201, unmountScope: 201 },
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
	'Operation              | render | full | void | lite | child | descriptors | text | unmount block/scope',
);
console.log(
	'-----------------------+--------+------+------+------+-------+-------------+------+--------------------',
);
for (const target of TARGETS) {
	for (const op of OPS) {
		const c = results[target.name][op.name];
		console.log(
			`${`${target.name}.${op.name}`.padEnd(22)} | ${String(c.renderBlock).padStart(6)} | ${String(c.componentSlot).padStart(4)} | ${String(c.componentSlotVoid).padStart(4)} | ${String(c.componentSlotLite).padStart(4)} | ${String(c.childSlot).padStart(5)} | ${String(c.createElement).padStart(11)} | ${String(c.setText).padStart(4)} | ${c.unmountBlock}/${c.unmountScope}`,
		);
	}
}

const outputPath = process.env.BENCH_JSON || process.env.WORK_JSON;
if (outputPath) {
	const payload = {
		suite: 'signal-favoring-work',
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
