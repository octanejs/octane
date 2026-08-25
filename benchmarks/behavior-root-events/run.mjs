process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const rootRequire = createRequire(path.join(REPO, 'package.json'));
const newsRequire = createRequire(path.join(REPO, 'benchmarks/news/package.json'));
const iterations = Number.parseInt(process.argv[2] ?? '8', 10);
const COUNTS = [1_000, 8_000];

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Behavior-root event iterations must be a positive integer');
}

async function buildEntry(outDir) {
	const { build } = await import(pathToFileURL(newsRequire.resolve('vite')).href);
	await build({
		root: HERE,
		configFile: false,
		logLevel: 'warn',
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		resolve: {
			alias: {
				'octane/behavior': path.join(REPO, 'packages/octane/src/behavior-root.ts'),
			},
		},
		build: {
			lib: {
				entry: path.join(HERE, 'src/entry.ts'),
				formats: ['iife'],
				name: 'BehaviorRootEventsBenchmark',
				fileName: () => 'entry.js',
			},
			outDir,
			emptyOutDir: true,
			minify: true,
			target: 'es2022',
		},
	});
}

function assertOutcome(count, outcome) {
	const expectedChecksum = (count * (count - 1)) / 2;
	if (outcome.handled !== count || !outcome.fifo || outcome.checksum !== expectedChecksum) {
		throw new Error(
			`${count}-event resume failed: handled=${outcome.handled}, fifo=${outcome.fifo}, ` +
				`checksum=${outcome.checksum}/${expectedChecksum}`,
		);
	}
}

async function measure(page, count) {
	const sample = await page.evaluate(async (eventCount) => {
		const batch = window.BehaviorRootEventsBenchmark.createBehaviorResumeBatch(eventCount);
		try {
			await batch.prepare();
			globalThis.gc?.();
			const started = performance.now();
			const outcome = await batch.resume();
			return { elapsed: performance.now() - started, outcome };
		} finally {
			batch.dispose();
		}
	}, count);
	assertOutcome(count, sample.outcome);
	return sample;
}

function errorText(error) {
	return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-behavior-root-events-'));
let browser;
let failure;
const rows = [];

try {
	await buildEntry(outDir);
	const playwright = await import(pathToFileURL(rootRequire.resolve('playwright')).href);
	const { chromium } = playwright.default ?? playwright;
	browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'],
	});
	const page = await browser.newPage();
	const browserErrors = [];
	page.on('pageerror', (error) => browserErrors.push(errorText(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') browserErrors.push(message.text());
	});
	await page.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
	await page.addScriptTag({ path: path.join(outDir, 'entry.js') });
	const loaded = await page.evaluate(
		() => typeof window.BehaviorRootEventsBenchmark?.createBehaviorResumeBatch === 'function',
	);
	if (!loaded) throw new Error('Production behavior-root benchmark bundle did not initialize');

	const samples = new Map(COUNTS.map((count) => [count, []]));
	const outcomes = new Map();
	for (const count of COUNTS) await measure(page, count);
	for (let iteration = 0; iteration < iterations; iteration++) {
		const order = iteration % 2 === 0 ? COUNTS : [...COUNTS].reverse();
		for (const count of order) {
			const sample = await measure(page, count);
			samples.get(count).push(sample.elapsed);
			outcomes.set(count, sample.outcome);
		}
	}
	if (browserErrors.length !== 0) {
		throw new Error(
			`Chromium emitted ${browserErrors.length} error(s): ${browserErrors.join('\n')}`,
		);
	}

	for (const count of COUNTS) {
		const raw = samples.get(count);
		const outcome = outcomes.get(count);
		rows.push({
			name: `events-${count}`,
			ops: {
				resume: timingStatForJson(summarizeSamples(raw)),
				resume_per_1000_events: timingStatForJson(
					summarizeSamples(raw.map((elapsed) => (elapsed * 1_000) / count)),
				),
			},
			meta: {
				events: count,
				correctness: 'pass',
				browser: 'chromium',
				browserVersion: browser.version(),
				...outcome,
			},
		});
	}

	for (const row of rows) {
		console.log(
			`PASS behavior-root-events/${row.name}: ${row.ops.resume.score.toFixed(3)}ms ` +
				`(${row.ops.resume_per_1000_events.score.toFixed(3)}ms/1k events)`,
		);
	}
} catch (error) {
	failure = errorText(error);
	console.error(`FAIL behavior-root-events/${failure}`);
} finally {
	try {
		await browser?.close();
	} catch (error) {
		failure ??= `Could not close Chromium: ${errorText(error)}`;
	}
	fs.rmSync(outDir, { recursive: true, force: true });
}

const payload = {
	suite: 'behavior-root-events',
	iterations,
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
