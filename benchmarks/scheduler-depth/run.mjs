process.env.NODE_ENV = 'production';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { octane } from '../../packages/octane/src/compiler/vite.js';

if (process.env.OCTANE_SCHEDULER_DEPTH_STACK !== '1') {
	const child = spawnSync(
		process.execPath,
		['--stack-size=16384', import.meta.filename, ...process.argv.slice(2)],
		{
			env: { ...process.env, OCTANE_SCHEDULER_DEPTH_STACK: '1' },
			stdio: 'inherit',
		},
	);
	process.exit(child.status ?? 1);
}

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const newsRequire = createRequire(path.join(REPO, 'benchmarks/news/package.json'));
const rawIterations = process.argv[2] ?? '9';
const iterations = Number(rawIterations);
const COUNTS = [500, 2_000];

if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

async function buildEntry(outDir) {
	const { build } = await import(pathToFileURL(newsRequire.resolve('vite')).href);
	const octaneSource = path.join(REPO, 'packages/octane/src');
	await build({
		root: REPO,
		configFile: false,
		logLevel: 'silent',
		resolve: {
			alias: [{ find: /^octane$/, replacement: path.join(octaneSource, 'index.ts') }],
		},
		plugins: [octane({ ssr: false })],
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		build: {
			lib: {
				entry: path.join(ROOT, 'src/entry.tsx'),
				formats: ['es'],
				fileName: () => 'entry.js',
			},
			outDir,
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
		'Node',
		'Element',
		'HTMLElement',
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

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-scheduler-depth-'));
let failure;
const targets = [];

try {
	await buildEntry(outDir);
	const dom = await setupDom();
	const entry = await import(pathToFileURL(path.join(outDir, 'entry.js')).href);
	const waves = new Map(COUNTS.map((count) => [count, entry.createSchedulerWave(count)]));
	const samples = new Map(COUNTS.map((count) => [count, []]));
	const lastResults = new Map();

	for (const count of COUNTS) {
		const warmup = waves.get(count).run();
		if (
			warmup.checksum !== count ||
			!warmup.connected ||
			!warmup.leafIdentityRetained ||
			warmup.queuedComponents !== count ||
			warmup.renderedComponents !== count
		) {
			throw new Error(`${count}-component warmup failed: ${JSON.stringify(warmup)}`);
		}
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		const order = iteration % 2 === 0 ? COUNTS : [...COUNTS].reverse();
		for (const count of order) {
			const result = waves.get(count).run();
			const expectedChecksum = count * (iteration + 2);
			if (
				result.checksum !== expectedChecksum ||
				!result.connected ||
				!result.leafIdentityRetained ||
				result.queuedComponents !== count ||
				result.renderedComponents !== count
			) {
				throw new Error(`${count}-component sample failed: ${JSON.stringify(result)}`);
			}
			samples.get(count).push(result.durationMs);
			lastResults.set(count, result);
		}
	}

	for (const count of COUNTS) {
		const result = lastResults.get(count);
		const rawSamples = samples.get(count);
		targets.push({
			name: `depth-${count}`,
			ops: {
				flush: timingStatForJson(summarizeSamples(rawSamples)),
				flush_per_1000_components: timingStatForJson(
					summarizeSamples(rawSamples.map((elapsed) => (elapsed * 1_000) / count)),
				),
			},
			meta: {
				checksum: result.checksum,
				correctness: 'pass',
				leafIdentityRetained: result.leafIdentityRetained,
				queuedComponents: result.queuedComponents,
				renderedComponents: result.renderedComponents,
			},
		});
	}

	for (const wave of waves.values()) wave.dispose();
	dom.window.close();
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
	fs.rmSync(outDir, { recursive: true, force: true });
}

const payload = {
	suite: 'scheduler-depth',
	iterations,
	targets,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
if (!process.env.BENCH_QUIET) {
	for (const target of targets) {
		console.log(
			`${target.name} flush: ${target.ops.flush.score.toFixed(3)}ms ` +
				`(min ${target.ops.flush.min.toFixed(3)}ms, rme ${target.ops.flush.rme.toFixed(1)}%)`,
		);
	}
	if (failure) console.error(`FAIL scheduler-depth: ${failure}`);
}
if (failure) process.exitCode = 1;
