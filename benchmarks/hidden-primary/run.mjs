// Parent updates of client-mounted, compiler-split Hydrate boundaries.
// Build from each checkout's source. Use the same fixture and dependencies.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Session } from 'node:inspector/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { pairedRatio, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../..');
const iterations = Number(process.argv[2] ?? 15);
assert.ok(Number.isSafeInteger(iterations) && iterations > 0, 'iterations must be positive');
const warmups = 4;
const updates = 8;
const rows = Array.from({ length: 32 }, (_, i) => i);
const checkouts = process.argv[3]
	? [
			['base', path.resolve(process.argv[3])],
			['candidate', repo],
		]
	: [['candidate', repo]];
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octane-hidden-primary-')));

async function compile(name, checkout, work) {
	const src = path.join(checkout, 'packages/octane/src');
	const { octane } = await import(pathToFileURL(path.join(src, 'compiler/vite.js')).href);
	const outDir = path.join(tmp, name, work ? 'work' : 'timing');
	const result = await build({
		root: here,
		configFile: false,
		logLevel: 'warn',
		resolve: {
			alias: [
				{ find: /^octane$/, replacement: path.join(src, 'index.ts') },
				{ find: /^octane\/hydration$/, replacement: path.join(src, 'hydration/index.ts') },
				{ find: /^octane\/internal\/client$/, replacement: path.join(src, 'internal/client.ts') },
			],
		},
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		plugins: [octane()],
		build: {
			lib: { entry: path.join(here, 'grid.tsrx'), formats: ['es'], fileName: () => 'grid.mjs' },
			outDir,
			emptyOutDir: true,
			minify: work ? false : 'esbuild',
			target: 'node22',
		},
	});
	const chunks = [result]
		.flat()
		.flatMap(({ output }) => output.filter((item) => item.type === 'chunk'));
	const hash = createHash('sha256');
	let gzipBytes = 0;
	for (const { fileName, code } of chunks.sort((a, b) => a.fileName.localeCompare(b.fileName))) {
		hash
			.update(fileName + '\0')
			.update(code)
			.update('\0');
		gzipBytes += gzipSync(code, { level: 9 }).length;
	}
	const bundle = { chunks: chunks.length, gzipBytes, sha256: hash.digest('hex') };
	return { ...(await import(pathToFileURL(path.join(outDir, 'grid.mjs')).href)), outDir, bundle };
}

function checkChildren(container, revision) {
	const children = [...container.querySelectorAll('span')];
	assert.deepEqual(
		children.map((child) => child.textContent),
		rows.map((row) => row + ':' + revision),
	);
}

async function sample(grid, mode, session, revisions = updates) {
	const container = document.body.appendChild(document.createElement('section'));
	const root = grid.createGrid(container, rows);
	async function reveal(revision) {
		const deadline = performance.now() + 5_000;
		while (container.querySelectorAll('span').length !== rows.length) {
			assert.ok(performance.now() < deadline, 'settled module did not wake every child');
			await delay(1);
		}
		checkChildren(container, revision);
	}
	const takeCoverage = () => session.post('Profiler.takePreciseCoverage');
	try {
		if (session) await takeCoverage();
		root.update(0);
		assert.equal(container.querySelector('span'), null);
		if (mode === 'resolved') {
			await reveal(0);
			if (session) await takeCoverage();
		}
		// A dynamic import (even a cached one) cannot settle during this JS turn.
		const start = performance.now();
		for (let revision = 1; revision <= revisions; revision++) root.update(revision);
		const ms = performance.now() - start;
		assert.equal(container.querySelector('output')?.textContent, String(revisions));
		if (mode === 'pending') assert.equal(container.querySelector('span'), null);
		let throws = 0;
		if (session) {
			const { result } = await takeCoverage();
			for (const script of result) {
				if (!script.url.startsWith(pathToFileURL(grid.outDir).href + '/')) continue;
				for (const fn of script.functions) {
					if (fn.functionName === 'SuspenseException') throws += fn.ranges[0].count;
				}
			}
		}
		if (mode === 'pending') await reveal(revisions);
		else checkChildren(container, revisions);
		root.update(revisions + 1);
		checkChildren(container, revisions + 1);
		return { ms, throws };
	} finally {
		root.unmount();
		container.remove();
	}
}

const dom = new JSDOM('<!doctype html><body>', { url: 'http://localhost/' });
for (const key of [
	'window',
	'document',
	'navigator',
	'Node',
	'NodeFilter',
	'Element',
	'HTMLElement',
	'Text',
	'Comment',
	'DocumentFragment',
	'MutationObserver',
	'EventTarget',
	'Event',
	'AbortController',
	'AbortSignal',
]) {
	Object.defineProperty(globalThis, key, {
		value: dom.window[key],
		configurable: true,
		writable: true,
	});
}

try {
	const grids = new Map();
	for (const [name, checkout] of checkouts) grids.set(name, await compile(name, checkout, false));
	const targets = ['pending', 'resolved'].flatMap((mode) =>
		Array.from(grids, ([name, grid]) => ({ name, mode, grid, samples: [] })),
	);
	for (let round = 0; round < warmups + iterations; round++) {
		for (const target of round % 2 ? targets.toReversed() : targets) {
			const { ms } = await sample(target.grid, target.mode);
			if (round >= warmups) target.samples.push(ms);
		}
	}
	const session = new Session();
	session.connect();
	try {
		await session.post('Profiler.enable');
		await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
		for (const [name, checkout] of checkouts) {
			const work = await compile(name, checkout, true);
			// The pending sample includes initial mount in its coverage window. Subtract
			// an identical fresh mount with no updates, and verify each row suspended.
			const mountThrows = (await sample(work, 'pending', session, 0)).throws;
			assert.equal(mountThrows, rows.length);
			for (const target of targets.filter((entry) => entry.name === name)) {
				const { throws } = await sample(work, target.mode, session);
				target.updateSuspensions = target.mode === 'pending' ? throws - mountThrows : throws;
				assert.ok(target.updateSuspensions >= 0);
				if (target.mode === 'resolved') assert.equal(throws, 0);
				else if (checkouts.length === 2) {
					if (name === 'base')
						assert.ok(target.updateSuspensions > 0, 'base did not reproduce pending retries');
					else assert.equal(target.updateSuspensions, 0, 'candidate retried the pending module');
				}
			}
		}
	} finally {
		await session.post('Profiler.stopPreciseCoverage');
		session.disconnect();
	}
	const results = targets.map(({ name, mode, samples, updateSuspensions }) => ({
		name,
		mode,
		updateSuspensions,
		samples,
		timing: timingStatForJson(summarizeSamples(samples)),
	}));
	console.table(
		results.map(({ name, mode, updateSuspensions, timing }) => ({
			name,
			mode,
			updateSuspensions,
			medianMs: timing.median,
			p95Ms: timing.p95,
		})),
	);
	const bundles = Object.fromEntries(Array.from(grids, ([name, grid]) => [name, grid.bundle]));
	console.table(bundles);
	const comparisons = [];
	if (grids.has('base') && iterations > 1) {
		for (const mode of ['pending', 'resolved']) {
			const [base, candidate] = targets.filter((target) => target.mode === mode);
			comparisons.push({ mode, ...pairedRatio(base.samples, candidate.samples) });
		}
		console.table(comparisons);
	}
	if (process.env.BENCH_JSON) {
		fs.writeFileSync(
			process.env.BENCH_JSON,
			JSON.stringify(
				{
					node: process.version,
					warmups,
					iterations,
					boundaries: rows.length,
					updates,
					bundles,
					results,
					comparisons,
				},
				null,
				2,
			) + '\n',
		);
	}
} finally {
	dom.window.close();
	fs.rmSync(tmp, { recursive: true, force: true });
}
// All roots are unmounted; the runtime's reusable MessageChannel may keep Node alive.
process.exit(0);
