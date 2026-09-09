// Deterministic, untimed production-work gate for Octane's TSRX/TSX twins.
// Source counters would change the compiler's purity analysis, so this observes
// unminified production diagnostic builds through Chromium precise call coverage.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import ts from 'typescript';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { slotHooks } from '../../packages/octane/src/compiler/slot-hooks.js';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
import { collectPreciseCalls } from '../lib/precise-work.mjs';
import { collectWarmAdoptionWork } from './warm-adoption-work.mjs';

// Standalone runs can target ephemeral previews so an unrelated worktree's
// server on the standard benchmark ports cannot produce stale-bundle counts.
const TARGETS = process.env.RECURSIVE_WORK_TARGETS
	? JSON.parse(process.env.RECURSIVE_WORK_TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5185/' },
			{ name: 'octane-jsx', url: 'http://localhost:5188/' },
		];

// The unified runner finishes its timed pass against normally minified assets
// before invoking this untimed gate. Build the same production fixtures without
// minification here so Chromium can attribute calls to the original function
// names; the existing preview servers serve the refreshed assets.
for (const target of TARGETS) {
	execFileSync('pnpm', ['exec', 'vite', 'build', '--minify', 'false'], {
		cwd: fileURLToPath(new URL(`${target.name}/`, import.meta.url)),
		stdio: 'inherit',
	});
}

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
	'useBatch',
	'registerWarmPlan',
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

// Plain .ts custom hooks use a separate compiler pass from the TSRX fixture.
// The mixed source proves the AST reader still detects generated batch calls.
const PLAIN_CONTEXT_HOOK = `import { createContext, use } from 'octane';
const Ctx = createContext(0);
export function usePair(): number {
  const first = use(Ctx);
  const second = use(Ctx);
  return first + second;
}`;
const PLAIN_MIXED_HOOK = `import { createContext, use } from 'octane';
const Ctx = createContext(0);
export function useMixed(promise: Promise<number>): number {
  const value = use(promise);
  const local = use(Ctx);
  return value + local;
}`;

function countImportedCalls(ast, importedName) {
	const locals = new Set();
	for (const statement of ast.statements) {
		if (!ts.isImportDeclaration(statement)) continue;
		const bindings = statement.importClause?.namedBindings;
		if (!bindings || !ts.isNamedImports(bindings)) continue;
		for (const specifier of bindings.elements) {
			if ((specifier.propertyName?.text ?? specifier.name.text) === importedName) {
				locals.add(specifier.name.text);
			}
		}
	}
	let calls = 0;
	function visit(node) {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			locals.has(node.expression.text)
		) {
			calls++;
		}
		ts.forEachChild(node, visit);
	}
	visit(ast);
	return { imports: locals.size, calls };
}

function measurePlainHook(source, environment) {
	const code =
		slotHooks(source, 'recursive-context-custom-hook.ts', {
			environment,
			dev: false,
			hmr: false,
		})?.code ?? source;
	const ast = ts.createSourceFile('compiled-custom-hook.ts', code, ts.ScriptTarget.Latest, true);
	if (ast.parseDiagnostics.length > 0) {
		throw new Error(`Plain ${environment} hook output contains invalid TypeScript`);
	}
	return {
		bytes: Buffer.byteLength(code),
		batch: countImportedCalls(ast, environment === 'server' ? 'puBatch' : 'useBatch'),
		use: countImportedCalls(ast, 'use'),
	};
}

const PLAIN_HOOKS = Object.fromEntries(
	['client', 'server'].map((environment) => [
		environment,
		{
			context: measurePlainHook(PLAIN_CONTEXT_HOOK, environment),
			mixed: measurePlainHook(PLAIN_MIXED_HOOK, environment),
		},
	]),
);

// The own-promise control must keep its direct batch and trailing warm thunk;
// reassigned props and locally shadowed components need the legacy closure.
// Inspect imported calls in the parsed production compiler output so helper
// aliases and generated formatting cannot obscure either negative case.
const REASSIGNED_PROPS_SOURCE = `import { use } from 'octane';
function Child(props) @{
  const value = use(props.load('child', props.version));
  <span>{value as string}</span>
}
export function Parent(props) @{
  <main>
    {((props = props.next), '') as string}
    <Child load={props.load} version={props.version} />
  </main>
}`;
const SHADOWED_COMPONENT_SOURCE = `import { use } from 'octane';
function Child(props) @{
  const value = use(props.load('child', props.version));
  <span>{value as string}</span>
}
export function Parent(props) @{
  const Parent = () => null;
  <main><Child load={props.load} version={props.version} /></main>
}`;

function measureCompiledControl(source, filename) {
	const code = compile(source, filename, { dev: false, hmr: false }).code;
	const ast = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);
	if (ast.parseDiagnostics.length > 0) throw new Error(`${filename}: invalid compiled TypeScript`);
	return {
		batch: countImportedCalls(ast, 'useBatch'),
		plan: countImportedCalls(ast, 'registerWarmPlan'),
		warmMemo: countImportedCalls(ast, 'warmMemo'),
	};
}

const WARM_CONTROL_FILE = fileURLToPath(
	new URL('./octane-tsrx/src/WarmPlanControl.tsrx', import.meta.url),
);
const COMPILED_CONTROLS = {
	ownPromise: measureCompiledControl(fs.readFileSync(WARM_CONTROL_FILE, 'utf8'), WARM_CONTROL_FILE),
	reassignedProps: measureCompiledControl(REASSIGNED_PROPS_SOURCE, 'warm-reassigned-props.tsrx'),
	shadowedComponent: measureCompiledControl(
		SHADOWED_COMPONENT_SOURCE,
		'warm-shadowed-component.tsrx',
	),
};

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
			exact: { useBatch: 0, registerWarmPlan: 2048 },
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
			exact: { setText: 1024, useBatch: 0, registerWarmPlan: 2048 },
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
			exact: { setText: 32, useBatch: 0, registerWarmPlan: 62 },
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
			exact: { useBatch: 0, registerWarmPlan: 0 },
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
			exact: { useBatch: 0, registerWarmPlan: 62 },
		},
		unmount: {
			maxFullSlotCalls: 0,
			maxSlotCalls: 0,
			max: { unmountBlock: 4099, unmountScope: 6146 },
			exact: { useBatch: 0, registerWarmPlan: 0 },
		},
	},
	'octane-jsx': {
		mount: {
			maxFullSlotCalls: 2049,
			maxSlotCalls: 4093,
			max: {
				renderBlock: 5128,
				componentSlot: 2049,
				childSlot: 7,
				createElement: 1027,
				hostElementBody: 1,
				deoptItemBody: 2,
				reconcileKeyed: 0,
				updateSurvivor: 0,
			},
			exact: { useBatch: 0, registerWarmPlan: 0 },
		},
		update_root: {
			maxFullSlotCalls: 2049,
			maxSlotCalls: 4093,
			max: {
				renderBlock: 5128,
				componentSlot: 2049,
				childSlot: 7,
				createElement: 1027,
				hostElementBody: 1,
				deoptItemBody: 2,
				reconcileKeyed: 1,
				updateSurvivor: 2,
			},
			exact: { setText: 1024, useBatch: 0, registerWarmPlan: 0 },
		},
		update_partial: {
			maxFullSlotCalls: 64,
			maxSlotCalls: 124,
			max: {
				renderBlock: 163,
				componentSlot: 64,
				childSlot: 5,
				createElement: 34,
				hostElementBody: 1,
				deoptItemBody: 2,
				reconcileKeyed: 1,
				updateSurvivor: 2,
			},
			exact: { setText: 32, useBatch: 0, registerWarmPlan: 0 },
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
				unmountBlock: 162,
				unmountScope: 222,
			},
			exact: { useBatch: 0, registerWarmPlan: 0 },
		},
		partial_remount: {
			maxFullSlotCalls: 64,
			maxSlotCalls: 124,
			max: {
				renderBlock: 163,
				componentSlot: 64,
				childSlot: 5,
				createElement: 34,
				hostElementBody: 1,
				deoptItemBody: 2,
				reconcileKeyed: 0,
				updateSurvivor: 0,
			},
			exact: { useBatch: 0, registerWarmPlan: 0 },
		},
		unmount: {
			maxFullSlotCalls: 0,
			maxSlotCalls: 0,
			max: { unmountBlock: 5128, unmountScope: 7172 },
			exact: { useBatch: 0, registerWarmPlan: 0 },
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
for (const [environment, { context, mixed }] of Object.entries(PLAIN_HOOKS)) {
	if (context.batch.imports !== 0 || context.batch.calls !== 0) {
		failures.push(`${environment}.plain_context: unexpected batch helper or call`);
	}
	if (context.use.calls !== 2) {
		failures.push(`${environment}.plain_context: ${context.use.calls} context reads, expected 2`);
	}
	if (context.bytes > Buffer.byteLength(PLAIN_CONTEXT_HOOK)) {
		failures.push(
			`${environment}.plain_context: generated ${context.bytes} bytes exceeds authored size`,
		);
	}
	if (mixed.batch.imports !== 1 || mixed.batch.calls !== 1) {
		failures.push(`${environment}.plain_mixed: expected one imported batch call`);
	}
}
for (const [name, control] of Object.entries(COMPILED_CONTROLS)) {
	const expectedBatchCalls = name === 'ownPromise' ? 3 : 2;
	const expectedWarmMemos = name === 'ownPromise' ? 2 : 1;
	if (control.batch.imports !== 1 || control.batch.calls !== expectedBatchCalls) {
		failures.push(`${name}: expected ${expectedBatchCalls} retained batch calls`);
	}
	if (control.plan.imports !== 0 || control.plan.calls !== 0) {
		failures.push(`${name}: unexpected extracted child-only warm plan`);
	}
	if (control.warmMemo.calls !== expectedWarmMemos) {
		failures.push(`${name}: expected ${expectedWarmMemos} warmable promise creations`);
	}
}
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
	results.warmPlanControl = await collectPreciseCalls(browser, {
		url: TARGETS.find((target) => target.name === 'octane-tsrx').url + 'warm-plan-control.html',
		operation: '__mountWarmPlanControl',
		after: ['__verifyWarmPlanControl'],
		metrics: ['useBatch', 'registerWarmPlan'],
	});
	if (results.warmPlanControl.useBatch !== 4 || results.warmPlanControl.registerWarmPlan !== 0) {
		failures.push(
			`ownPromise: expected 4 batch calls and no extracted plan, got ` +
				`${results.warmPlanControl.useBatch}/${results.warmPlanControl.registerWarmPlan}`,
		);
	}
	results.warmAdoption = await collectWarmAdoptionWork(
		browser,
		TARGETS.find((target) => target.name === 'octane-tsrx').url + 'warm-adoption.html',
	);
} finally {
	await browser.close();
}

console.log(
	'Operation                 | render | full | void | lite | child | descriptors | host/deopt/keyed/survivors | text | batch/plan | unmount block/scope',
);
console.log(
	'--------------------------+--------+------+------+------+-------+-------------+----------------------------+------+------------+--------------------',
);
for (const target of TARGETS) {
	for (const op of OPS) {
		const c = results[target.name][op.name];
		console.log(
			`${`${target.name}.${op.name}`.padEnd(25)} | ${String(c.renderBlock).padStart(6)} | ${String(c.componentSlot).padStart(4)} | ${String(c.componentSlotVoid).padStart(4)} | ${String(c.componentSlotLite).padStart(4)} | ${String(c.childSlot).padStart(5)} | ${String(c.createElement).padStart(11)} | ${c.hostElementBody}/${c.deoptItemBody}/${c.reconcileKeyed}/${c.updateSurvivor} | ${String(c.setText).padStart(4)} | ${`${c.useBatch}/${c.registerWarmPlan}`.padStart(10)} | ${c.unmountBlock}/${c.unmountScope}`,
		);
	}
}
console.log(
	`own-promise async parent/child: batch/plan=${results.warmPlanControl.useBatch}/${results.warmPlanControl.registerWarmPlan}, resources=1/1 and visible output verified`,
);
for (const [name, { batch, plan, warmMemo }] of Object.entries(COMPILED_CONTROLS)) {
	console.log(
		`${name} compiled: batch calls=${batch.calls}, plan calls=${plan.calls}, warmable creations=${warmMemo.calls}`,
	);
}
for (const [environment, { context, mixed }] of Object.entries(PLAIN_HOOKS)) {
	console.log(
		`plain-${environment}: context bytes=${context.bytes}, use calls=${context.use.calls}, batch imports/calls=${context.batch.imports}/${context.batch.calls}; mixed batch imports/calls=${mixed.batch.imports}/${mixed.batch.calls}`,
	);
}

// The separate keyed-row fixture shares this Vite app but runs on an ephemeral
// preview port so an existing preview of another worktree cannot hide a stale
// bundle. It rebuilds with normal minification after precise coverage finishes.
const { contextCacheResults } = await import('./context-cache-work.mjs');

const outputPath = process.env.BENCH_JSON || process.env.WORK_JSON;
if (outputPath) {
	const payload = {
		suite: 'recursive-context-work',
		targets: [
			...TARGETS.map((target) => ({
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
					gates: failures.some((failure) => failure.startsWith(`${target.name}.`))
						? 'fail'
						: 'pass',
				},
			})),
			...Object.entries(PLAIN_HOOKS).map(([environment, { context, mixed }]) => ({
				name: `plain-${environment}-work`,
				ops: Object.fromEntries(
					Object.entries({
						context_bytes: context.bytes,
						context_use_calls: context.use.calls,
						context_batch_imports: context.batch.imports,
						context_batch_calls: context.batch.calls,
						mixed_batch_imports: mixed.batch.imports,
						mixed_batch_calls: mixed.batch.calls,
					}).map(([metric, value]) => [
						metric,
						deterministicStatForJson(deterministicCount(value)),
					]),
				),
				meta: {
					gates: failures.some((failure) => failure.startsWith(`${environment}.`))
						? 'fail'
						: 'pass',
				},
			})),
			...Object.entries(COMPILED_CONTROLS).map(([name, { batch, plan, warmMemo }]) => ({
				name: `octane-${name}-compiled-work`,
				ops: Object.fromEntries(
					Object.entries({
						batch_calls: batch.calls,
						plan_calls: plan.calls,
						warm_memo_calls: warmMemo.calls,
					}).map(([metric, value]) => [
						metric,
						deterministicStatForJson(deterministicCount(value)),
					]),
				),
				meta: {
					gates: failures.some((failure) => failure.startsWith(`${name}:`)) ? 'fail' : 'pass',
				},
			})),
			{
				name: 'octane-own-promise-runtime-work',
				ops: Object.fromEntries(
					Object.entries(results.warmPlanControl).map(([metric, value]) => [
						metric,
						deterministicStatForJson(deterministicCount(value)),
					]),
				),
				meta: {
					gates: failures.some((failure) => failure.startsWith('ownPromise:')) ? 'fail' : 'pass',
				},
			},
			{
				name: 'octane-warm-adoption-work',
				ops: Object.fromEntries(
					Object.entries(results.warmAdoption).flatMap(([operation, measurements]) =>
						Object.entries(measurements)
							.filter(([, value]) => typeof value === 'number')
							.map(([metric, value]) => [
								`${operation}_${metric}`,
								deterministicStatForJson(deterministicCount(value)),
							]),
					),
				),
				meta: { gates: 'pass' },
			},
			{
				name: 'octane-context-cache-work',
				ops: Object.fromEntries(
					Object.entries(contextCacheResults).flatMap(([variant, measurements]) =>
						Object.entries(measurements).map(([operation, value]) => [
							`${variant}_${operation}`,
							operation === 'updateMs'
								? value
								: deterministicStatForJson(deterministicCount(value)),
						]),
					),
				),
				meta: { gates: 'pass' },
			},
		],
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
