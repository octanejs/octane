import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_GRAPH_ROOT
	? path.resolve(process.env.OCTANE_GRAPH_ROOT)
	: path.resolve(HERE, '../..');
const { compile } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/index.js')).href
);
const sourceRequire = createRequire(path.join(SOURCE_ROOT, 'packages/octane/package.json'));
const { parseModule } = await import(pathToFileURL(sourceRequire.resolve('@tsrx/core')).href);
const COMPONENTS = 2_400;
const ANCHORLESS_COMPONENTS = 9_600;
const runnerArgs = process.argv.slice(2);
const positionalArgs = runnerArgs.filter((arg) => !arg.startsWith('--'));
const flags = new Set(runnerArgs.filter((arg) => arg.startsWith('--')));
const iterations = Number.parseInt(positionalArgs[0] ?? '8', 10);
const anchorlessOnly = flags.has('--anchorless-only');
const includeRawSamples = flags.has('--raw-samples');
const options = { mode: 'client', hmr: false, dev: false, autoMemo: true };
const anchorlessOptions = { ...options, autoMemo: false };

const unknownFlags = [...flags].filter(
	(flag) => flag !== '--anchorless-only' && flag !== '--raw-samples',
);
if (positionalArgs.length > 1 || unknownFlags.length > 0) {
	throw new Error(
		`Unknown TSrX component graph arguments: ${[...positionalArgs.slice(1), ...unknownFlags].join(
			', ',
		)}`,
	);
}
if (
	!Number.isSafeInteger(iterations) ||
	iterations < 1 ||
	(positionalArgs[0] !== undefined && String(iterations) !== positionalArgs[0])
) {
	throw new Error('TSrX component graph iterations must be a positive integer');
}

function sourceFor(reverse, opaqueLeaf) {
	const declarations = Array.from({ length: COMPONENTS }, (_, index) => {
		const body =
			index === COMPONENTS - 1
				? opaqueLeaf
					? '<Opaque />'
					: '{live as string}'
				: `<Component${index + 1} />`;
		return `${index === 0 ? 'export ' : ''}function Component${index}() @{ <div>${body}</div> }`;
	});
	if (reverse) declarations.reverse();
	const imported = opaqueLeaf ? 'Opaque' : 'live';
	return `import { ${imported} } from './live';\n${declarations.join('\n')}`;
}

function anchorlessSourceFor(components, reverse) {
	const declarations = Array.from({ length: components }, (_, index) => {
		const body =
			index === components - 1
				? '@if (props.on) { <span /> }'
				: `@if (props.on) { <AnchorlessChain${index + 1} on={props.on} /> } @else { <div /> }`;
		return `function AnchorlessChain${index}(props) @{ ${body} }`;
	});
	if (reverse) declarations.reverse();
	declarations.push('function AnchorlessTail() @{ <b /> }');
	declarations.push(
		'export function AnchorlessApp(props) @{ <main data-anchorless-benchmark><AnchorlessChain0 on={props.on} /><AnchorlessTail /></main> }',
	);
	return declarations.join('\n');
}

const variants = [
	...(!anchorlessOnly
		? [
				{
					name: 'dependent-first',
					kind: 'existing',
					source: sourceFor(false, false),
					samples: [],
				},
				{
					name: 'dependency-first',
					kind: 'existing',
					source: sourceFor(true, false),
					samples: [],
				},
				{
					name: 'warm-dependent-first',
					kind: 'existing',
					source: sourceFor(false, true),
					samples: [],
				},
				{
					name: 'warm-dependency-first',
					kind: 'existing',
					source: sourceFor(true, true),
					samples: [],
				},
			]
		: []),
	...[false, true].map((reverse) => ({
		name: `anchorless-${reverse ? 'dependency-first' : 'dependent-first'}-${ANCHORLESS_COMPONENTS}`,
		kind: 'anchorless',
		components: ANCHORLESS_COMPONENTS,
		reverse,
		source: anchorlessSourceFor(ANCHORLESS_COMPONENTS, reverse),
		samples: [],
	})),
];

function warmPlanCount(code) {
	return code.match(/\b__warm:\s*\(/g)?.length ?? 0;
}

function walkAst(node, visit, seen = new WeakSet()) {
	if (node === null || typeof node !== 'object' || seen.has(node)) return;
	seen.add(node);
	if (Array.isArray(node)) {
		for (const child of node) walkAst(child, visit, seen);
		return;
	}
	if (typeof node.type !== 'string') return;
	visit(node);
	for (const value of Object.values(node)) walkAst(value, visit, seen);
}

function analyzeCompiledOutput(code, filename) {
	const ast = parseModule(code, filename);
	let templateBinding = null;
	let singleRootBinding = null;
	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source?.value !== 'octane') continue;
		for (const specifier of statement.specifiers || []) {
			if (specifier.type !== 'ImportSpecifier') continue;
			if (specifier.imported?.name === 'template') templateBinding = specifier.local.name;
			if (specifier.imported?.name === '__s') singleRootBinding = specifier.local.name;
		}
	}
	const templates = [];
	let singleRootCapabilities = 0;
	walkAst(ast, (node) => {
		if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return;
		if (node.callee.name === templateBinding && typeof node.arguments[0]?.value === 'string') {
			templates.push(node.arguments[0].value);
		}
		if (node.callee.name === singleRootBinding) singleRootCapabilities++;
	});
	return { templates, singleRootCapabilities };
}

function anchorCount(template) {
	return template.split('<!>').length - 1;
}

function findTemplate(analysis, witness) {
	const matches = analysis.templates.filter((template) => template.includes(witness));
	assert.equal(matches.length, 1, `expected one compiled template containing ${witness}`);
	return matches[0];
}

const anchorlessOracleGraphs = [
	{
		name: 'chain',
		components: [
			{ name: 'ChainRoot', edges: ['ChainMiddle'], localSafe: true },
			{ name: 'ChainMiddle', edges: ['ChainSeed'], localSafe: true },
			{ name: 'ChainSeed', edges: [], localSafe: false },
		],
	},
	{
		name: 'branch-fan-in',
		components: [
			{ name: 'BranchRoot', edges: ['BranchLeft', 'BranchRight'], localSafe: true },
			{ name: 'BranchLeft', edges: ['BranchShared'], localSafe: true },
			{ name: 'BranchRight', edges: ['BranchShared'], localSafe: true },
			{ name: 'BranchShared', edges: ['BranchSeed'], localSafe: true },
			{ name: 'BranchSeed', edges: [], localSafe: false },
		],
	},
	{
		name: 'multiple-seeds',
		components: [
			{ name: 'ManyRoot', edges: ['ManyLeft', 'ManyRight'], localSafe: true },
			{ name: 'ManyLeft', edges: ['ManySeedA'], localSafe: true },
			{ name: 'ManyRight', edges: ['ManySeedB'], localSafe: true },
			{ name: 'ManySeedA', edges: [], localSafe: false },
			{ name: 'ManySeedB', edges: [], localSafe: false },
			{ name: 'ManySafe', edges: [], localSafe: true },
		],
	},
	{
		name: 'safe-cycle',
		components: [
			{ name: 'SafeCycleA', edges: ['SafeCycleB'], localSafe: true },
			{ name: 'SafeCycleB', edges: ['SafeCycleA'], localSafe: true },
		],
	},
	{
		name: 'seeded-cycle',
		components: [
			{ name: 'SeededCycleA', edges: ['SeededCycleB'], localSafe: true },
			{ name: 'SeededCycleB', edges: ['SeededCycleA', 'CycleSeed'], localSafe: true },
			{ name: 'CycleSeed', edges: [], localSafe: false },
		],
	},
	{
		name: 'imported-missing',
		imports: ["import { ImportedLeaf } from './imported';"],
		components: [
			{ name: 'ImportedParent', edges: ['ImportedLeaf'], localSafe: true },
			{ name: 'MissingParent', edges: ['MissingLeaf'], localSafe: true },
			{
				name: 'ExternalRoot',
				edges: ['ImportedParent', 'MissingParent'],
				localSafe: true,
			},
		],
	},
	{
		name: 'repeated-edges',
		components: [
			{
				name: 'RepeatedParent',
				edges: ['RepeatedSeed', 'RepeatedSeed', 'RepeatedSeed'],
				localSafe: true,
			},
			{ name: 'RepeatedSeed', edges: [], localSafe: false },
		],
	},
	{
		name: 'ineligible-dependent-boundary',
		components: [
			{ name: 'BoundaryCaller', edges: ['HookBoundary'], localSafe: true },
			{
				name: 'HookBoundary',
				edges: ['BoundarySeed'],
				localSafe: true,
				eligible: false,
			},
			{ name: 'BoundarySeed', edges: [], localSafe: false },
			{ name: 'DirectHookCaller', edges: ['UnsafeHookLeaf'], localSafe: true },
			{ name: 'UnsafeHookLeaf', edges: [], localSafe: false, eligible: false },
		],
	},
];

// Deliberately independent of the compiler worklist: bounded controls use the
// old, simple repeated fixed point as their reference model.
function solveAnchorlessSafety(components) {
	const byName = new Map(components.map((component) => [component.name, component]));
	const safe = new Map(components.map((component) => [component.name, component.localSafe]));
	let changed = true;
	while (changed) {
		changed = false;
		for (const component of components) {
			if (safe.get(component.name) !== true) continue;
			for (const calleeName of component.edges) {
				const callee = byName.get(calleeName);
				if (callee !== undefined && callee.eligible !== false && safe.get(calleeName) !== true) {
					safe.set(component.name, false);
					changed = true;
					break;
				}
			}
		}
	}
	return safe;
}

function oracleComponentSource(component) {
	const setup = component.eligible === false ? 'const [state] = useState(0); ' : '';
	if (!component.localSafe) {
		return `function ${component.name}(props) @{ ${setup}@if (props.on) { <span data-oracle-node="${component.name}" /> } }`;
	}
	if (component.edges.length === 0) {
		return `function ${component.name}(props) @{ ${setup}<span data-oracle-node="${component.name}" /> }`;
	}
	if (component.edges.length === 1) {
		return `function ${component.name}(props) @{ ${setup}@if (props.route === 0) { <${component.edges[0]} on={props.on} route={props.route} /> } @else { <span data-oracle-node="${component.name}" /> } }`;
	}
	const cases = component.edges
		.map(
			(calleeName, index) =>
				`@case ${index}: { <${calleeName} on={props.on} route={props.route} /> }`,
		)
		.join(' ');
	return `function ${component.name}(props) @{ ${setup}@switch (props.route) { ${cases} @default: { <span data-oracle-node="${component.name}" /> } } }`;
}

function anchorlessOracleSource(graph, reverse) {
	const declarations = graph.components.map(oracleComponentSource);
	if (reverse) declarations.reverse();
	const imports = [...(graph.imports ?? [])];
	if (graph.components.some((component) => component.eligible === false)) {
		imports.push("import { useState } from 'octane';");
	}
	declarations.push('function OracleTail() @{ <b /> }');
	for (const [index, component] of graph.components.entries()) {
		declarations.push(
			`function OracleProbe${index}(props) @{ <section data-anchorless-probe="${graph.name}-${index}"><${component.name} on={props.on} route={props.route} /><OracleTail /></section> }`,
		);
	}
	declarations.push(
		`export function OracleControls(props) @{ <main>${graph.components
			.map((_component, index) => `<OracleProbe${index} on={props.on} route={props.route} />`)
			.join('')}</main> }`,
	);
	return [...imports, ...declarations].join('\n');
}

function assertAnchorlessControls() {
	const controls = [];
	for (const graph of anchorlessOracleGraphs) {
		const expectedSafety = solveAnchorlessSafety(graph.components);
		for (const reverse of [false, true]) {
			const order = reverse ? 'dependency-first' : 'dependent-first';
			const name = `${graph.name}-${order}`;
			const result = compile(
				anchorlessOracleSource(graph, reverse),
				`${name}.tsrx`,
				anchorlessOptions,
			);
			assert.equal(result.diagnostics.length, 0, `${name} emitted compiler diagnostics`);
			const analysis = analyzeCompiledOutput(result.code, `${name}.compiled.js`);
			const probes = [];
			for (const [index, component] of graph.components.entries()) {
				const safe = expectedSafety.get(component.name);
				const expectedAnchors = component.eligible !== false && !safe ? 2 : 0;
				assert.equal(
					anchorCount(findTemplate(analysis, `data-anchorless-probe="${graph.name}-${index}"`)),
					expectedAnchors,
					`${name} changed ${component.name}'s anchorless probe behavior`,
				);
				probes.push({
					component: component.name,
					eligible: component.eligible !== false,
					safe,
					expectedAnchors,
				});
			}
			controls.push({ name, probes, correctness: 'pass' });
		}
	}
	return controls;
}

function assertCycleControls() {
	const syncCycle = compile(
		'export function CycleA() @{ <CycleB /> }\nfunction CycleB() @{ <CycleA /> }',
		'synchronous-cycle.tsrx',
		options,
	);
	assert.equal(syncCycle.diagnostics.length, 0, 'synchronous cycle emitted compiler diagnostics');
	assert.equal(warmPlanCount(syncCycle.code), 0, 'synchronous cycle gained a warm plan');

	const seededCycle = compile(
		"import { Opaque } from './opaque';\nexport function CycleA() @{ <><CycleB /><Opaque /></> }\nfunction CycleB() @{ <CycleA /> }",
		'opaque-cycle.tsrx',
		options,
	);
	assert.equal(seededCycle.diagnostics.length, 0, 'opaque cycle emitted compiler diagnostics');
	assert.equal(warmPlanCount(seededCycle.code), 2, 'opaque cycle lost warm reachability');
}

function compileVariant(variant) {
	const started = performance.now();
	compile(
		variant.source,
		`${variant.name}.tsrx`,
		variant.kind === 'anchorless' ? anchorlessOptions : options,
	);
	return performance.now() - started;
}

function validateExistingVariant(variant, result) {
	const witnesses = result.code.match(/const __memoDep[\w$]* = live;/g)?.length ?? 0;
	const warmPlans = warmPlanCount(result.code);
	const hoistedDeclarations =
		result.code.match(/^(?:export )?function Component\d+\(/gm)?.length ?? 0;
	const dependentFirst = variant.name.endsWith('dependent-first');
	const warm = variant.name.startsWith('warm-');
	const expectedHoistedDeclarations = dependentFirst ? COMPONENTS - 1 : 0;
	assert.equal(result.diagnostics.length, 0, `${variant.name} emitted compiler diagnostics`);
	assert.equal(
		witnesses,
		warm ? 0 : COMPONENTS - 1,
		`${variant.name} did not preserve every transitive live-binding witness`,
	);
	assert.equal(
		warmPlans,
		warm ? COMPONENTS : 0,
		`${variant.name} changed same-module warm-plan reachability`,
	);
	assert.equal(
		hoistedDeclarations,
		expectedHoistedDeclarations,
		`${variant.name} changed its above-declaration component references`,
	);
	variant.meta = {
		components: COMPONENTS,
		callEdges: COMPONENTS - 1,
		liveBindingWitnesses: witnesses,
		warmPlans,
		hoistedDeclarations,
		sourceBytes: Buffer.byteLength(variant.source),
		outputBytes: Buffer.byteLength(result.code),
		correctness: 'pass',
	};
}

function validateAnchorlessVariant(variant, result) {
	assert.equal(result.diagnostics.length, 0, `${variant.name} emitted compiler diagnostics`);
	const analysis = analyzeCompiledOutput(result.code, `${variant.name}.compiled.js`);
	const template = findTemplate(analysis, 'data-anchorless-benchmark');
	const anchors = anchorCount(template);
	const warmPlans = warmPlanCount(result.code);
	const hoistedDeclarations = result.code.match(/^function AnchorlessChain\d+\(/gm)?.length ?? 0;
	const expectedHoistedDeclarations = variant.reverse ? 0 : variant.components - 1;
	assert.equal(anchors, 2, `${variant.name} lost the unsafe-chain positional anchors`);
	assert.equal(
		warmPlans,
		0,
		`${variant.name} unexpectedly emitted warm plans with autoMemo disabled`,
	);
	assert.equal(
		analysis.singleRootCapabilities,
		2,
		`${variant.name} changed the unsafe chain's single-root classification`,
	);
	assert.equal(
		hoistedDeclarations,
		expectedHoistedDeclarations,
		`${variant.name} changed its above-declaration component references`,
	);
	variant.meta = {
		components: variant.components,
		callEdges: variant.components - 1,
		locallyUnsafeRoots: 1,
		transitivelyUnsafeRoots: variant.components,
		appTemplateAnchors: anchors,
		singleRootCapabilities: analysis.singleRootCapabilities,
		warmPlans,
		hoistedDeclarations,
		autoMemo: false,
		sourceBytes: Buffer.byteLength(variant.source),
		outputBytes: Buffer.byteLength(result.code),
		correctness: 'pass',
	};
}

function validateVariant(variant) {
	const result = compile(
		variant.source,
		`${variant.name}.validation.tsrx`,
		variant.kind === 'anchorless' ? anchorlessOptions : options,
	);
	if (variant.kind === 'anchorless') validateAnchorlessVariant(variant, result);
	else validateExistingVariant(variant, result);
}

let failure;
const rows = [];
let semanticControls = [];

try {
	if (!anchorlessOnly) assertCycleControls();
	semanticControls = assertAnchorlessControls();
	// Compile and validate every deterministic semantic surface before the warmups.
	// Timed samples below contain only the public compiler call.
	for (const variant of variants) validateVariant(variant);
	for (let warmup = 0; warmup < 2; warmup++) {
		for (const variant of warmup % 2 === 0 ? variants : variants.toReversed()) {
			compileVariant(variant);
		}
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const variant of iteration % 2 === 0 ? variants : variants.toReversed()) {
			variant.samples.push(compileVariant(variant));
		}
	}

	for (const variant of variants) {
		const compileStat = timingStatForJson(summarizeSamples(variant.samples), { p99: true });
		const ops = { compile: compileStat };
		if (variant.kind === 'anchorless') {
			ops.compile_per_1000_components = timingStatForJson(
				summarizeSamples(variant.samples.map((elapsed) => (elapsed * 1_000) / variant.components)),
				{ p99: true },
			);
		}
		rows.push({
			name: variant.name,
			ops,
			meta: variant.meta,
			...(includeRawSamples ? { rawSamples: { compile: variant.samples } } : {}),
		});
		console.log(
			`PASS tsrx-component-graph/${variant.name}: ${compileStat.score.toFixed(3)}ms ` +
				`for ${variant.components ?? COMPONENTS} components`,
		);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-component-graph/${failure}`);
}

const payload = {
	suite: 'tsrx-component-graph',
	iterations,
	targets: rows,
	semanticControls,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
