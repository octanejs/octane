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
const COUNTS = [128, 1_024];

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
		'Element',
		'HTMLElement',
		'HTMLButtonElement',
		'HTMLOutputElement',
		'Text',
		'Comment',
		'DocumentFragment',
		'MutationObserver',
	]) {
		const value = key === 'window' ? dom.window : dom.window[key];
		if (value === undefined) continue;
		Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
	}
	return dom;
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-hydration-render-queue-'));
const clientFile = path.join(tempDir, 'client', 'entry.js');
const serverFile = path.join(tempDir, 'server', 'entry.js');
let failure;
const targets = [];

try {
	await buildEntry(path.join(HERE, 'src/client.ts'), clientFile, false);
	await buildEntry(path.join(HERE, 'src/server.ts'), serverFile, true);
	const server = await import(pathToFileURL(serverFile).href);
	const serverHtml = new Map(COUNTS.map((count) => [count, server.renderCase(count)]));
	const dom = await setupDom();
	const client = await import(pathToFileURL(clientFile).href);
	const samples = new Map(COUNTS.map((count) => [count, []]));
	const controls = new Map();

	const runCase = (count) => {
		const foreignContainer = document.createElement('main');
		const targetContainer = document.createElement('main');
		targetContainer.innerHTML = serverHtml.get(count);
		document.body.append(foreignContainer, targetContainer);
		const result = client.runHydrationQueueCase(foreignContainer, targetContainer, count);
		foreignContainer.remove();
		targetContainer.remove();
		controls.set(count, result);
		return result.durationMs;
	};

	for (const count of COUNTS) runCase(count);
	for (let iteration = 0; iteration < iterations; iteration++) {
		const order = iteration % 2 === 0 ? COUNTS : [...COUNTS].reverse();
		for (const count of order) samples.get(count).push(runCase(count));
	}

	for (const count of COUNTS) {
		const raw = samples.get(count);
		const control = controls.get(count);
		targets.push({
			name: `rows-${count}`,
			ops: {
				hydrate: timingStatForJson(summarizeSamples(raw)),
				hydrate_per_100_rows: timingStatForJson(
					summarizeSamples(raw.map((elapsed) => (elapsed * 100) / count)),
				),
			},
			meta: {
				correctness: 'pass',
				foreignRows: control.foreignRows,
				foreignWorkPreserved: control.foreignWorkPreserved,
				interactionHandled: control.interactionHandled,
				serverNodesAdopted: control.serverNodesAdopted,
				targetRows: control.targetRows,
				unmountClean: control.unmountClean,
			},
		});
	}

	for (const target of targets) {
		console.log(
			`PASS hydration-render-phase-queue/${target.name}: ` +
				`${target.ops.hydrate.score.toFixed(3)}ms ` +
				`(${target.ops.hydrate_per_100_rows.score.toFixed(3)}ms/100 rows)`,
		);
	}
	dom.window.close();
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL hydration-render-phase-queue/${failure}`);
} finally {
	fs.rmSync(tempDir, { recursive: true, force: true });
}

const payload = {
	suite: 'hydration-render-phase-queue',
	iterations,
	targets,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
if (failure) process.exitCode = 1;
