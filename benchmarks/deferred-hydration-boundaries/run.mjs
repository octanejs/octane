process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { octane } from '../../packages/octane/src/compiler/vite.js';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../..');
const benchmarkRequire = createRequire(path.join(REPO, 'benchmarks/news/package.json'));
const rawIterations = process.argv[2] ?? '9';
const iterations = Number(rawIterations);
const CASES = [
	{ name: 'boundary-1', boundaryCount: 1, childCount: 1 },
	{ name: 'boundaries-2048', boundaryCount: 2_048, childCount: 1 },
];
const PLAIN_CONTROL = {
	name: 'plain-2048',
	boundaryCount: 2_048,
	childCount: 1,
};

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

async function buildEntry(entry, output, ssr) {
	const { build } = await import(pathToFileURL(benchmarkRequire.resolve('vite')).href);
	const octaneSource = path.join(REPO, 'packages/octane/src');
	await build({
		root: REPO,
		configFile: false,
		logLevel: 'warn',
		resolve: {
			alias: [
				{
					find: /^octane\/internal\/client$/,
					replacement: path.join(octaneSource, 'internal/client.ts'),
				},
				{
					find: /^octane\/internal\/server$/,
					replacement: path.join(octaneSource, 'internal/server.ts'),
				},
				{
					find: /^octane\/hydration$/,
					replacement: path.join(octaneSource, 'hydration/index.ts'),
				},
				{ find: /^octane\/server$/, replacement: path.join(octaneSource, 'server/index.ts') },
				{ find: /^octane$/, replacement: path.join(octaneSource, 'index.ts') },
			],
		},
		plugins: [octane({ ssr })],
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		build: {
			lib: { entry, formats: ['es'], fileName: () => path.basename(output) },
			outDir: path.dirname(output),
			emptyOutDir: true,
			minify: true,
			target: 'node22',
		},
	});
}

async function setupDom() {
	const { JSDOM } = await import('jsdom');
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		pretendToBeVisual: true,
		url: 'http://localhost/',
	});
	for (const key of [
		'window',
		'document',
		'navigator',
		'EventTarget',
		'Event',
		'MouseEvent',
		'Node',
		'NodeFilter',
		'Element',
		'HTMLElement',
		'HTMLButtonElement',
		'Text',
		'Comment',
		'DocumentFragment',
		'MutationObserver',
		'AbortController',
		'AbortSignal',
	]) {
		const value = key === 'window' ? dom.window : dom.window[key];
		if (value === undefined) continue;
		Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
	}
	return dom;
}

function countSetAllocations(run) {
	const NativeSet = globalThis.Set;
	let setAllocations = 0;
	class CountingSet extends NativeSet {
		constructor(values) {
			super(values);
			setAllocations++;
		}
	}
	Object.defineProperty(globalThis, 'Set', {
		value: CountingSet,
		configurable: true,
		writable: true,
	});
	try {
		const result = run();
		return { result, setAllocations };
	} finally {
		Object.defineProperty(globalThis, 'Set', {
			value: NativeSet,
			configurable: true,
			writable: true,
		});
	}
}

function assertHydrationResult(testCase, result) {
	const expectedCells = testCase.boundaryCount * testCase.childCount;
	if (
		result.boundaryCount !== testCase.boundaryCount ||
		result.cellCount !== expectedCells ||
		!result.serverNodesAdopted ||
		!result.sidecarsRemoved ||
		!result.unmountClean
	) {
		throw new Error(`${testCase.name} failed its semantic controls: ${JSON.stringify(result)}`);
	}
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-deferred-boundaries-'));
const clientFile = path.join(tempDir, 'client', 'entry.js');
const serverFile = path.join(tempDir, 'server', 'entry.js');
let failure;
let dom;
const targets = [];

try {
	await buildEntry(path.join(HERE, 'src/client.ts'), clientFile, false);
	await buildEntry(path.join(HERE, 'src/server.ts'), serverFile, true);
	const server = await import(pathToFileURL(serverFile).href);
	const serverHtml = new Map(
		CASES.map((testCase) => [
			testCase.name,
			server.renderCase(testCase.boundaryCount, testCase.childCount),
		]),
	);
	dom = await setupDom();
	const client = await import(pathToFileURL(clientFile).href);
	const samples = new Map([...CASES, PLAIN_CONTROL].map((testCase) => [testCase.name, []]));
	const controls = new Map();
	const setupSetAllocations = new Map();

	const runHydration = (testCase) => {
		const container = document.createElement('main');
		document.body.appendChild(container);
		container.innerHTML = serverHtml.get(testCase.name);
		const result = client.hydrateCase(container, testCase.boundaryCount, testCase.childCount);
		assertHydrationResult(testCase, result);
		container.remove();
		controls.set(testCase.name, result);
		return result.durationMs;
	};
	const runPlainControl = () => {
		const container = document.createElement('main');
		document.body.appendChild(container);
		const result = client.mountPlainCase(
			container,
			PLAIN_CONTROL.boundaryCount,
			PLAIN_CONTROL.childCount,
		);
		if (
			result.cellCount !== PLAIN_CONTROL.boundaryCount * PLAIN_CONTROL.childCount ||
			!result.unmountClean
		) {
			throw new Error(`plain control failed its semantic controls: ${JSON.stringify(result)}`);
		}
		container.remove();
		controls.set(PLAIN_CONTROL.name, result);
		return result.durationMs;
	};

	for (const testCase of CASES) runHydration(testCase);
	runPlainControl();
	for (let iteration = 0; iteration < iterations; iteration++) {
		const orderedCases = iteration % 2 === 0 ? CASES : [...CASES].reverse();
		for (const testCase of orderedCases) {
			samples.get(testCase.name).push(runHydration(testCase));
		}
		samples.get(PLAIN_CONTROL.name).push(runPlainControl());
	}

	for (const testCase of CASES) {
		const container = document.createElement('main');
		document.body.appendChild(container);
		container.innerHTML = serverHtml.get(testCase.name);
		const instrumented = countSetAllocations(() =>
			client.hydrateCase(container, testCase.boundaryCount, testCase.childCount),
		);
		assertHydrationResult(testCase, instrumented.result);
		container.remove();
		setupSetAllocations.set(testCase.name, instrumented.setAllocations);
		const control = controls.get(testCase.name);
		targets.push({
			name: testCase.name,
			ops: { hydrate: timingStatForJson(summarizeSamples(samples.get(testCase.name))) },
			meta: {
				correctness: 'pass',
				boundaries: testCase.boundaryCount,
				cells: control.cellCount,
				hydrateSetupSetAllocations: instrumented.setAllocations,
				serverNodesAdopted: control.serverNodesAdopted,
				sidecarsRemoved: control.sidecarsRemoved,
				unmountClean: control.unmountClean,
			},
		});
	}
	const plainControl = controls.get(PLAIN_CONTROL.name);
	targets.push({
		name: PLAIN_CONTROL.name,
		ops: { mount: timingStatForJson(summarizeSamples(samples.get(PLAIN_CONTROL.name))) },
		meta: {
			correctness: 'pass',
			boundaries: PLAIN_CONTROL.boundaryCount,
			cells: plainControl.cellCount,
			unmountClean: plainControl.unmountClean,
		},
	});
	const smallSetAllocations = setupSetAllocations.get(CASES[0].name);
	const largeSetAllocations = setupSetAllocations.get(CASES[1].name);
	const largeTarget = targets.find((target) => target.name === CASES[1].name);
	if (
		typeof smallSetAllocations !== 'number' ||
		typeof largeSetAllocations !== 'number' ||
		largeTarget === undefined
	) {
		throw new Error('deferred boundary setup allocation controls are incomplete');
	}
	const addedBoundaryCount = CASES[1].boundaryCount - CASES[0].boundaryCount;
	const setAllocationsPerAddedBoundary =
		(largeSetAllocations - smallSetAllocations) / addedBoundaryCount;
	largeTarget.meta.setAllocationsPerAddedBoundary = setAllocationsPerAddedBoundary;
	if (setAllocationsPerAddedBoundary > 3.05) {
		throw new Error(
			`deferred boundary setup allocated ${setAllocationsPerAddedBoundary.toFixed(3)} Sets per added boundary`,
		);
	}

	for (const target of targets) {
		const operation = target.ops.hydrate ?? target.ops.mount;
		console.log(
			`PASS deferred-hydration-boundaries/${target.name}: ${operation.score.toFixed(3)}ms`,
		);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL deferred-hydration-boundaries/${failure}`);
} finally {
	dom?.window.close();
	fs.rmSync(tempDir, { recursive: true, force: true });
}

const payload = {
	suite: 'deferred-hydration-boundaries',
	iterations,
	targets,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
if (failure) process.exitCode = 1;
// Deferred hydration initializes the runtime's post-paint MessageChannel. Every
// root has been unmounted and every result has been written, so do not leave the
// benchmark process alive solely for that reusable scheduler handle.
process.exit(failure ? 1 : 0);
