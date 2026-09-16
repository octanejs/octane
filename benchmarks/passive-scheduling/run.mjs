// Public-root passive scheduling, with callback identity observed only in a
// separate untimed bundle. Timings use the clean production runtime.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';

const REPO = path.resolve(import.meta.dirname, '../..');
const SOURCE_REPO = path.resolve(process.argv[2] ?? process.env.PASSIVE_SOURCE_ROOT ?? REPO);
const SOURCE = path.join(SOURCE_REPO, 'packages/octane/src');
const requireDependencies = createRequire(path.join(REPO, 'packages/octane/package.json'));
const { build } = requireDependencies('esbuild');
const { Window } = await import(pathToFileURL(requireDependencies.resolve('happy-dom')).href);
const CYCLES = 128;
const WORK_KEY = '__octanePassiveScheduleWork';
const stamp = (score) => ({ score, median: score, min: score, samples: 1 });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-passive-scheduling-'));

function observeSchedules(source) {
	const needle = 'function schedulePostPaint(cb: () => void): void {';
	assert.equal(source.split(needle).length, 2, 'one post-paint scheduling entry');
	return source.replace(
		needle,
		`${needle}\n\tglobalThis.${WORK_KEY}.calls++;\n\tglobalThis.${WORK_KEY}.callbacks.add(cb);`,
	);
}

async function bundleRuntime(observed) {
	const outfile = path.join(scratch, observed ? 'observed.mjs' : 'clean.mjs');
	await build({
		entryPoints: [path.join(SOURCE, 'runtime.ts')],
		outfile,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		minify: true,
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [path.join(REPO, 'packages/octane/node_modules'), path.join(REPO, 'node_modules')],
		plugins: observed
			? [
					{
						name: 'observe-passive-schedules',
						setup(plugin) {
							plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: sourceFile }) => ({
								contents: observeSchedules(fs.readFileSync(sourceFile, 'utf8')),
								loader: 'ts',
							}));
						},
					},
				]
			: [],
	});
	return import(pathToFileURL(outfile).href);
}

const window = new Window({ url: 'http://localhost/' });
for (const name of [
	'window',
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Text',
	'Comment',
	'Event',
	'MouseEvent',
	'MutationObserver',
]) {
	globalThis[name] = name === 'window' ? window : window[name];
}

function resetWork() {
	globalThis[WORK_KEY] = { calls: 0, callbacks: new Set() };
}

function drive(runtime, timing = false) {
	const effectSlot = Symbol('passive');
	const log = [];
	let active = -1;
	function effectBody(version) {
		assert.equal(active, -1, 'the previous effect is disconnected before replacement');
		active = version;
		if (!timing) log.push(`body:${version}`);
		return () => {
			assert.equal(active, version, 'cleanup belongs to the live effect');
			active = -1;
			if (!timing) log.push(`cleanup:${version}`);
		};
	}
	function App(props) {
		runtime.useEffect(effectBody, [props.version], effectSlot);
		return runtime.createElement('output', null, String(props.version));
	}
	const container = document.createElement('div');
	const root = runtime.createRoot(container);
	function update(version) {
		runtime.flushSync(() => root.render(App, { version }));
		runtime.drainPassiveEffects();
	}
	try {
		root.render(App, { version: 0 });
		runtime.drainPassiveEffects();
		const output = container.firstElementChild;
		resetWork();
		for (let version = 1; version <= CYCLES; version++) update(version);
		const changed = {
			schedules: globalThis[WORK_KEY].calls,
			callbacks: globalThis[WORK_KEY].callbacks.size,
		};
		assert.equal(active, CYCLES);
		assert.equal(container.textContent, String(CYCLES));
		assert.equal(container.firstElementChild, output, 'updates preserve the output node');
		resetWork();
		for (let i = 0; i < CYCLES; i++) update(CYCLES);
		const unchanged = {
			schedules: globalThis[WORK_KEY].calls,
			callbacks: globalThis[WORK_KEY].callbacks.size,
		};
		const samples = [];
		if (timing) {
			let version = CYCLES;
			for (let i = 0; i < 2000; i++) update(++version);
			for (let sample = 0; sample < 9; sample++) {
				const start = performance.now();
				for (let i = 0; i < 2000; i++) update(++version);
				samples.push(((performance.now() - start) * 1000) / 2000);
				assert.equal(active, version);
				assert.equal(container.textContent, String(version));
			}
		}
		root.unmount();
		assert.equal(active, -1, 'unmount disconnects the final effect');
		if (!timing) {
			const expected = ['body:0'];
			for (let version = 1; version <= CYCLES; version++)
				expected.push(`cleanup:${version - 1}`, `body:${version}`);
			expected.push(`cleanup:${CYCLES}`);
			assert.deepEqual(log, expected, 'each committed effect connects and disconnects once');
		}
		return { changed, unchanged, log, samples };
	} finally {
		root.unmount();
	}
}

try {
	resetWork();
	const cleanRuntime = await bundleRuntime(false);
	const observedRuntime = await bundleRuntime(true);
	const clean = drive(cleanRuntime);
	const observed = drive(observedRuntime);
	assert.deepEqual(observed.log, clean.log, 'observation preserves public effect behavior');
	assert.equal(observed.changed.schedules, CYCLES);
	assert.equal(observed.unchanged.schedules, 0, 'unchanged dependencies schedule nothing');
	const timing = process.env.PASSIVE_TIMING === '0' ? [] : drive(cleanRuntime, true).samples;
	const sorted = timing.slice().sort((a, b) => a - b);
	const cleanBytes = fs.readFileSync(path.join(scratch, 'clean.mjs'));
	const report = {
		suite: 'passive-scheduling',
		targets: [
			{
				name: 'runtime',
				ops: {
					changed_schedules: stamp(observed.changed.schedules),
					changed_callback_identities: stamp(observed.changed.callbacks),
					unchanged_schedules: stamp(observed.unchanged.schedules),
					unchanged_callback_identities: stamp(observed.unchanged.callbacks),
				},
				meta: {
					cycles: CYCLES,
					source: SOURCE_REPO,
					runtimeSha256: createHash('sha256')
						.update(fs.readFileSync(path.join(SOURCE, 'runtime.ts')))
						.digest('hex'),
					bundleSha256: createHash('sha256').update(cleanBytes).digest('hex'),
					bytes: cleanBytes.length,
					gzip: gzipSync(cleanBytes, { level: 9 }).length,
					timingMicroseconds:
						timing.length === 0
							? null
							: { median: sorted[4], min: sorted[0], max: sorted[8], samples: timing },
				},
			},
			{
				name: 'budget',
				ops: {
					changed_callback_identities: stamp(1),
					changed_schedules: stamp(CYCLES),
					unchanged_schedules: stamp(1),
					unchanged_callback_identities: stamp(1),
				},
			},
		],
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2));
	await new Promise((done) => process.stdout.write(JSON.stringify(report, null, 2) + '\n', done));
} finally {
	await window.happyDOM.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
// Bundled runtimes own Node MessageChannels; the roots and DOM are already closed.
process.exit(0);
