import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.OCTANE_HYDRATE_SLICING_ROOT
	? path.resolve(process.env.OCTANE_HYDRATE_SLICING_ROOT)
	: path.resolve(HERE, '../..');
const { createOctaneCompiler } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/bundler.js')).href
);
const { prepareHydrateBoundaries } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'packages/octane/src/compiler/hydrate-boundaries.js')).href
);
const sourceRequire = createRequire(path.join(SOURCE_ROOT, 'packages/octane/package.json'));
const { parseModule } = await import(pathToFileURL(sourceRequire.resolve('@tsrx/core')).href);

const FILE = '/project/src/App.tsrx';
const HIGH_BOUNDARIES = 2_400;
const LOW_BOUNDARIES = 150;
const GROUP_SIZE = 40;
const runnerArgs = process.argv.slice(2);
const positionalArgs = runnerArgs.filter((argument) => !argument.startsWith('--'));
const flags = new Set(runnerArgs.filter((argument) => argument.startsWith('--')));
const iterations = Number.parseInt(positionalArgs[0] ?? '7', 10);
const includeRawSamples = flags.has('--raw-samples');

if (
	positionalArgs.length > 1 ||
	[...flags].some((flag) => flag !== '--raw-samples') ||
	!Number.isSafeInteger(iterations) ||
	iterations < 1 ||
	(positionalArgs[0] !== undefined && String(iterations) !== positionalArgs[0])
) {
	throw new Error('usage: node run.mjs [positive-iterations] [--raw-samples]');
}

function fixtureSource(boundaries, movable) {
	const declarations = Array.from(
		{ length: boundaries },
		(_, index) =>
			`${movable ? '' : 'export '}function Item${index}() @{ <span data-slice="${index}">${index}</span> }`,
	).join('\n');
	const groupCount = Math.ceil(boundaries / GROUP_SIZE);
	const groups = Array.from({ length: groupCount }, (_, group) => {
		const start = group * GROUP_SIZE;
		const children = Array.from(
			{ length: Math.min(GROUP_SIZE, boundaries - start) },
			(_, offset) => {
				const index = start + offset;
				return `<Hydrate when={true}><Item${index} /></Hydrate>`;
			},
		).join('');
		return `function Group${group}() @{ <>${children}</> }`;
	}).join('\n');
	const groupChildren = Array.from({ length: groupCount }, (_, group) => `<Group${group} />`).join(
		'',
	);
	return `import { Hydrate } from 'octane';
${declarations}
${groups}
export function App() @{ <>${groupChildren}</> }`;
}

function compiler() {
	return createOctaneCompiler({ root: '/project', hmr: false, dev: false });
}

function checksumString(value) {
	let checksum = 2_166_136_261;
	for (let index = 0; index < value.length; index++) {
		checksum = Math.imul(checksum ^ value.charCodeAt(index), 16_777_619) >>> 0;
	}
	return checksum;
}

function walkAst(root, visit) {
	const seen = new WeakSet();
	const walk = (node) => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		visit(node);
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata' || key === 'parent') continue;
			walk(value);
		}
	};
	walk(root);
}

function dynamicImportRequests(code) {
	const requests = new Set();
	walkAst(parseModule(code, 'compiled.js'), (node) => {
		if (node.type === 'ImportExpression' && typeof node.source?.value === 'string') {
			requests.add(node.source.value);
		}
	});
	return requests;
}

function compileRoot(source, environment = 'client') {
	const result = compiler().transform(source, FILE, { environment });
	assert.ok(result, `${environment} compiler returned no result`);
	assert.deepEqual(result.diagnostics, [], `${environment} compiler emitted diagnostics`);
	return result;
}

function compileChild(source, boundaryPath) {
	const result = compiler().transform(source, `${FILE}?octane-hydrate=${boundaryPath}`, {
		environment: 'client',
	});
	assert.ok(result, `child ${boundaryPath} compiler returned no result`);
	assert.deepEqual(result.diagnostics, [], `child ${boundaryPath} compiler emitted diagnostics`);
	return result;
}

function validateFixture(fixture) {
	const root = compileRoot(fixture.source);
	const requests = dynamicImportRequests(root.code);
	assert.equal(requests.size, fixture.boundaries, `${fixture.name} changed dynamic import count`);
	for (const index of [0, Math.floor(fixture.boundaries / 2), fixture.boundaries - 1]) {
		const request = `./App.tsrx?octane-hydrate=${index}`;
		assert.ok(requests.has(request), `${fixture.name} omitted ${request}`);
		const child = compileChild(fixture.source, String(index));
		const marker = `data-slice=\\"${index}\\"`;
		if (fixture.movable) {
			assert.ok(child.code.includes(marker), `${fixture.name} child ${index} lost its declaration`);
			assert.ok(
				!root.code.includes(marker),
				`${fixture.name} root retained moved declaration ${index}`,
			);
		} else {
			assert.ok(
				root.code.includes(marker),
				`${fixture.name} root lost retained declaration ${index}`,
			);
			assert.ok(
				!child.code.includes(marker),
				`${fixture.name} child copied retained declaration ${index}`,
			);
		}
	}
	const server = compileRoot(fixture.source, 'server');
	assert.equal(
		dynamicImportRequests(server.code).size,
		0,
		`${fixture.name} server output gained dynamic imports`,
	);
	assert.ok(
		server.code.includes('data-slice="0"'),
		`${fixture.name} server lost first declaration`,
	);
	assert.ok(
		server.code.includes(`data-slice="${fixture.boundaries - 1}"`),
		`${fixture.name} server lost last declaration`,
	);
	fixture.meta = {
		...fixture.meta,
		boundaryRequests: requests.size,
		rootChecksum: checksumString(root.code),
		rootOutputBytes: Buffer.byteLength(root.code),
		serverChecksum: checksumString(server.code),
		serverOutputBytes: Buffer.byteLength(server.code),
	};
}

function measureFocused(fixture) {
	const startedCpu = process.cpuUsage();
	const startedWall = performance.now();
	const prepared = prepareHydrateBoundaries(fixture.source, FILE, null, fixture.ast);
	const elapsedWall = performance.now() - startedWall;
	const elapsedCpu = process.cpuUsage(startedCpu);
	assert.ok(prepared, `${fixture.name} produced no hydrate preparation`);
	return {
		checksum: prepared.ast.body.length,
		elapsed: (elapsedCpu.user + elapsedCpu.system) / 1_000,
		elapsedWall,
	};
}

function measurePipeline(fixture) {
	const startedCpu = process.cpuUsage();
	const startedWall = performance.now();
	const result = compiler().transform(fixture.source, FILE, { environment: 'client' });
	const elapsedWall = performance.now() - startedWall;
	const elapsedCpu = process.cpuUsage(startedCpu);
	assert.ok(result, `${fixture.name} compiler returned no result`);
	assert.deepEqual(result.diagnostics, [], `${fixture.name} compiler emitted diagnostics`);
	return {
		checksum: checksumString(result.code),
		elapsed: (elapsedCpu.user + elapsedCpu.system) / 1_000,
		elapsedWall,
	};
}

const movableLow = {
	name: 'movable-low',
	boundaries: LOW_BOUNDARIES,
	movable: true,
	source: fixtureSource(LOW_BOUNDARIES, true),
	meta: { boundaries: LOW_BOUNDARIES, declarations: LOW_BOUNDARIES, movable: true },
};
const movableHigh = {
	name: 'movable-high',
	boundaries: HIGH_BOUNDARIES,
	movable: true,
	source: fixtureSource(HIGH_BOUNDARIES, true),
	meta: { boundaries: HIGH_BOUNDARIES, declarations: HIGH_BOUNDARIES, movable: true },
};
const retainedHigh = {
	name: 'retained-high',
	boundaries: HIGH_BOUNDARIES,
	movable: false,
	source: fixtureSource(HIGH_BOUNDARIES, false),
	meta: { boundaries: HIGH_BOUNDARIES, declarations: HIGH_BOUNDARIES, movable: false },
};
for (const fixture of [movableLow, movableHigh, retainedHigh]) {
	fixture.ast = parseModule(fixture.source, FILE);
	fixture.meta.sourceBytes = Buffer.byteLength(fixture.source);
}

const targets = [
	{
		name: 'focused-movable-low',
		fixture: movableLow,
		measure: () => measureFocused(movableLow),
		normalizeBy: LOW_BOUNDARIES,
		samples: [],
		wallSamples: [],
	},
	{
		name: 'focused-movable-high',
		fixture: movableHigh,
		measure: () => measureFocused(movableHigh),
		normalizeBy: HIGH_BOUNDARIES,
		samples: [],
		wallSamples: [],
	},
	{
		name: 'focused-retained-high',
		fixture: retainedHigh,
		measure: () => measureFocused(retainedHigh),
		normalizeBy: HIGH_BOUNDARIES,
		samples: [],
		wallSamples: [],
	},
	{
		name: 'pipeline-movable-low',
		fixture: movableLow,
		measure: () => measurePipeline(movableLow),
		normalizeBy: LOW_BOUNDARIES,
		samples: [],
		wallSamples: [],
	},
	{
		name: 'pipeline-movable-high',
		fixture: movableHigh,
		measure: () => measurePipeline(movableHigh),
		normalizeBy: HIGH_BOUNDARIES,
		samples: [],
		wallSamples: [],
	},
	{
		name: 'pipeline-retained-high',
		fixture: retainedHigh,
		measure: () => measurePipeline(retainedHigh),
		normalizeBy: HIGH_BOUNDARIES,
		samples: [],
		wallSamples: [],
	},
];

let failure;
try {
	for (const fixture of [movableLow, movableHigh, retainedHigh]) validateFixture(fixture);
	const expectedChecksums = new Map();
	for (const target of targets) {
		expectedChecksums.set(target.name, target.measure().checksum);
	}
	for (let warmup = 0; warmup < 2; warmup++) {
		for (const target of warmup % 2 === 0 ? targets : targets.toReversed()) {
			const sample = target.measure();
			assert.equal(
				sample.checksum,
				expectedChecksums.get(target.name),
				`${target.name} warmup checksum changed`,
			);
		}
	}
	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const target of iteration % 2 === 0 ? targets : targets.toReversed()) {
			const sample = target.measure();
			assert.equal(
				sample.checksum,
				expectedChecksums.get(target.name),
				`${target.name} checksum changed`,
			);
			target.samples.push(sample.elapsed);
			target.wallSamples.push(sample.elapsedWall);
		}
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-hydrate-module-slicing/${failure}`);
}

const rows = targets.map((target) => {
	const ops =
		target.samples.length === 0
			? {}
			: {
					compile: timingStatForJson(summarizeSamples(target.samples), { p99: true }),
					compile_wall: timingStatForJson(summarizeSamples(target.wallSamples), { p99: true }),
					compile_per_1000_boundaries: timingStatForJson(
						summarizeSamples(
							target.samples.map((elapsed) => (elapsed * 1_000) / target.normalizeBy),
						),
						{ p99: true },
					),
				};
	return {
		name: target.name,
		ops,
		meta: {
			...target.fixture.meta,
			correctness: failure ? 'fail' : 'pass',
			focused: target.name.startsWith('focused-'),
		},
		...(includeRawSamples ? { rawSamples: { compile: target.samples } } : {}),
	};
});

if (!failure) {
	for (const target of rows) {
		console.log(
			`PASS tsrx-hydrate-module-slicing/${target.name}: ` +
				`${target.ops.compile.score.toFixed(3)}ms CPU, ` +
				`${target.ops.compile_wall.score.toFixed(3)}ms wall`,
		);
	}
}

const payload = {
	suite: 'tsrx-hydrate-module-slicing',
	iterations,
	meta: { sourceRoot: SOURCE_ROOT, timing: 'process-cpu-ms' },
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
