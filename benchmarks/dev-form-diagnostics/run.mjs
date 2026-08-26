// Development-only controlled-form diagnostic scaling. The two batches run in
// one process and alternate measurement order so the ratio shares the same JIT,
// scheduler, and machine conditions.
process.env.NODE_ENV = 'development';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const iterations = Number.parseInt(process.argv[2] ?? '8', 10);
const COUNTS = [4_000, 32_000];

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Development form diagnostic iterations must be a positive integer');
}

async function buildEntry(outDir) {
	const { build } = await import('vite');
	await build({
		root: HERE,
		configFile: false,
		logLevel: 'warn',
		define: { 'process.env.NODE_ENV': JSON.stringify('development') },
		build: {
			lib: {
				entry: path.join(HERE, 'src/entry.ts'),
				formats: ['es'],
				fileName: () => 'entry.js',
			},
			outDir,
			emptyOutDir: true,
			minify: true,
			target: 'es2022',
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
		'HTMLInputElement',
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

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-dev-form-diagnostics-'));
let failure;
const rows = [];

try {
	await buildEntry(outDir);
	const dom = await setupDom();
	const entry = await import(pathToFileURL(path.join(outDir, 'entry.js')).href);
	const batches = new Map(COUNTS.map((count) => [count, entry.createDiagnosticBatch(count)]));
	const samples = new Map(COUNTS.map((count) => [count, []]));
	const diagnosticErrors = [];
	const originalError = console.error;
	console.error = (...args) => diagnosticErrors.push(args);

	try {
		for (const count of COUNTS) {
			const batch = batches.get(count);
			batch.commit();
			const validation = batch.validate();
			if (validation.count !== count || !validation.valuesMatch) {
				throw new Error(`${count}-host warmup left a controlled value stale`);
			}
		}

		for (let iteration = 0; iteration < iterations; iteration++) {
			const order = iteration % 2 === 0 ? COUNTS : [...COUNTS].reverse();
			for (const count of order) {
				const started = performance.now();
				const outcome = batches.get(count).commit();
				samples.get(count).push(performance.now() - started);
				if (outcome.count !== count || !outcome.sampledValuesMatch) {
					throw new Error(`${count}-host commit did not update every sampled controlled value`);
				}
			}
		}

		for (const count of COUNTS) {
			const validation = batches.get(count).validate();
			if (validation.count !== count || !validation.valuesMatch) {
				throw new Error(`${count}-host measured commits left a controlled value stale`);
			}
		}
	} finally {
		console.error = originalError;
	}

	if (diagnosticErrors.length !== 0) {
		throw new Error(`read-only controls emitted ${diagnosticErrors.length} diagnostics`);
	}

	for (const count of COUNTS) {
		const raw = samples.get(count);
		rows.push({
			name: `hosts-${count}`,
			ops: {
				commit: timingStatForJson(summarizeSamples(raw)),
				commit_per_1000_hosts: timingStatForJson(
					summarizeSamples(raw.map((elapsed) => (elapsed * 1_000) / count)),
				),
			},
			meta: { controls: count, correctness: 'pass', diagnosticErrors: 0 },
		});
	}

	for (const row of rows) {
		console.log(
			`PASS dev-form-diagnostics/${row.name}: ${row.ops.commit.score.toFixed(3)}ms ` +
				`(${row.ops.commit_per_1000_hosts.score.toFixed(3)}ms/1k hosts)`,
		);
	}

	for (const batch of batches.values()) batch.dispose();
	dom.window.close();
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL dev-form-diagnostics/${failure}`);
} finally {
	fs.rmSync(outDir, { recursive: true, force: true });
}

const payload = {
	suite: 'dev-form-diagnostics',
	iterations,
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
