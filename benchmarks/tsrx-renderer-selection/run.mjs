import fs from 'node:fs';
import {
	normalizeRendererConfig,
	resolveRendererForFile,
} from '../../packages/octane/src/compiler/renderers.js';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const iterations = Number.parseInt(process.argv[2] ?? '9', 10);
const repetitions = iterations <= 3 ? 32 : 96;

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('TSRX renderer-selection iterations must be a positive integer');
}

const rawConfig = {
	registry: {
		canvas: { module: '@octanejs/canvas/renderer', capabilities: ['pointer-events'] },
		gpu: { module: '@octanejs/gpu/renderer', text: 'ignore' },
		native: { module: '@octanejs/native/renderer', text: 'host' },
		object: '@octanejs/object/renderer',
		three: '@octanejs/three/renderer',
	},
	rules: [
		{
			include: 'src/scenes/**/*.{tsrx,tsx}',
			exclude: ['**/*.native.tsrx', '**/*.object.tsrx'],
			renderer: 'three',
		},
		{
			include: ['packages/**/objects/*.[jt]srx', 'src/scenes/**/*.object.tsrx'],
			renderer: 'object',
		},
		{
			include: 'src/native/**/[A-Z]*.{tsrx,tsx}',
			exclude: ['**/*.stories.*', '**/*.test.*'],
			renderer: 'native',
		},
		{ include: 'packages/**/renderer?.{tsrx,tsx}', renderer: 'canvas' },
		{ include: '**/*.shader.{tsrx,tsx}', renderer: 'gpu' },
		{ include: '**/*.{mobile,native}.tsrx', renderer: 'native' },
		{ include: '**/*.{model,object}.tsrx', renderer: 'object' },
		{ include: '**/*.{scene,three}.tsrx', renderer: 'three' },
	],
};

const cases = [
	['/src/scenes/Hero.tsrx', 'three'],
	['/src/scenes/Hero.object.tsrx', 'object'],
	[String.raw`\src\scenes\Nested\Hero.tsx?worker`, 'three'],
	['/src/native/View.tsrx#client', 'native'],
	['/src/native/View.test.tsrx', 'dom'],
	['/packages/editor/renderer1.tsx?raw', 'canvas'],
	['/packages/editor/rendererA.tsrx#dev', 'canvas'],
	['/src/effects/water.shader.tsrx', 'gpu'],
	['/src/mobile/Shell.mobile.tsrx', 'native'],
	['/src/models/Tree.model.tsrx', 'object'],
	['/src/world/Level.scene.tsrx', 'three'],
	['/src/App.tsrx', 'dom'],
	['./src/scenes/../App.tsrx', 'dom'],
	['#virtual/Scene.three.tsrx?import', 'three'],
	['/src/scenes/Skip.native.tsrx', 'native'],
	['/packages/view/objects/Widget.tsrx', 'object'],
];

function mixChecksum(checksum, id) {
	for (let index = 0; index < id.length; index++) {
		checksum = Math.imul(checksum ^ id.charCodeAt(index), 16_777_619);
	}
	return checksum >>> 0;
}

function expectedChecksum() {
	let checksum = 2_166_136_261;
	for (let repetition = 0; repetition < repetitions; repetition++) {
		for (const [, expected] of cases) checksum = mixChecksum(checksum, expected);
	}
	return checksum;
}

const expected = expectedChecksum();

function resolveWorkload(config) {
	let checksum = 2_166_136_261;
	for (let repetition = 0; repetition < repetitions; repetition++) {
		for (const [filename] of cases) {
			checksum = mixChecksum(checksum, resolveRendererForFile(config, filename).id);
		}
	}
	return checksum;
}

function measure(config) {
	const started = performance.now();
	const checksum = resolveWorkload(config);
	const elapsed = performance.now() - started;
	if (checksum !== expected) {
		throw new Error(`renderer checksum changed: expected ${expected}, received ${checksum}`);
	}
	return elapsed;
}

const rows = new Map([
	['raw-config', []],
	['normalized-config', []],
]);
let failure;

try {
	for (const [filename, expectedId] of cases) {
		const actualId = resolveRendererForFile(rawConfig, filename).id;
		if (actualId !== expectedId) {
			throw new Error(`${filename} resolved to ${actualId}; expected ${expectedId}`);
		}
	}

	const normalizedConfig = normalizeRendererConfig(rawConfig);
	measure(rawConfig);
	measure(normalizedConfig);

	for (let iteration = 0; iteration < iterations; iteration++) {
		const order =
			iteration % 2 === 0
				? ['raw-config', 'normalized-config']
				: ['normalized-config', 'raw-config'];
		for (const name of order) {
			rows.get(name).push(measure(name === 'raw-config' ? rawConfig : normalizedConfig));
		}
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-renderer-selection/${failure}`);
}

const targets = [...rows].map(([name, samples]) => ({
	name,
	ops: samples.length === 0 ? {} : { resolve: timingStatForJson(summarizeSamples(samples)) },
	meta: {
		callsPerSample: repetitions * cases.length,
		cases: cases.length,
		checksum: expected,
		correctness: failure ? 'fail' : 'pass',
	},
}));

if (!failure) {
	for (const target of targets) {
		console.log(
			`PASS tsrx-renderer-selection/${target.name}: ${target.ops.resolve.score.toFixed(3)}ms ` +
				`(${target.meta.callsPerSample} classifications, checksum ${target.meta.checksum})`,
		);
	}
}

const payload = {
	suite: 'tsrx-renderer-selection',
	iterations,
	targets,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
