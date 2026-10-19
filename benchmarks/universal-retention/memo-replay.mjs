import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { acquireBenchmarkLock } from '../lib/run-lock.mjs';
import { pairedRatio, summarizeSamples } from '../lib/stats.mjs';

const repo = resolve(import.meta.dirname, '../..');
const { values } = parseArgs({
	options: { base: { type: 'string' }, samples: { type: 'string', default: '7' } },
});
assert.ok(values.base, 'Pass --base=<baseline commit>');
const samples = Number(values.samples);
assert.ok(Number.isSafeInteger(samples) && samples >= 2);
const git = (...args) =>
	execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const base = git('rev-parse', '--verify', values.base + '^{commit}');
const file = 'packages/octane/src/universal-core.ts';
assert.ok(
	git('diff', '--name-only', base, '--', 'packages/octane/src')
		.split('\n')
		.every((path) => path === '' || path === file),
	'The comparison only replaces universal-core.ts; use a baseline with identical adjacent sources',
);
const sources = [git('show', `${base}:${file}`), readFileSync(resolve(repo, file), 'utf8')];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const { build } = createRequire(resolve(repo, 'package.json'))('esbuild');
const report = {
	metadata: {
		base,
		head: git('rev-parse', 'HEAD'),
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		samples,
		warmup: 3,
		sourceHashes: sources.map(hash),
		harnessHash: hash(readFileSync(import.meta.filename)),
		lockfileHash: hash(readFileSync(resolve(repo, 'pnpm-lock.yaml'))),
		method:
			'Production Node object driver; alternating AB/BA pairs. Initial render and request settlement/replay timed separately. Assertions and teardown excluded. No device, Hermes, or input-latency claim.',
	},
	bytes: [],
	results: [],
};
async function bundle(source) {
	const result = await build({
		entryPoints: [resolve(repo, 'packages/octane/src/universal-native.ts')],
		absWorkingDir: repo,
		bundle: true,
		format: 'esm',
		platform: 'node',
		write: false,
		minify: true,
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'replay-source',
				setup(plugin) {
					plugin.onLoad({ filter: /[/\\]universal-core\.ts$/ }, () => ({
						contents: source,
						loader: 'ts',
						resolveDir: resolve(repo, 'packages/octane/src'),
					}));
				},
			},
		],
	});
	const bytes = result.outputFiles[0].contents;
	report.bytes.push({
		raw: bytes.length,
		gzip: gzipSync(bytes).length,
		brotli: brotliCompressSync(bytes).length,
	});
	return import('data:text/javascript;base64,' + Buffer.from(bytes).toString('base64'));
}
async function workload(runtime, size, mode) {
	const {
		createObjectContainer,
		createObjectDriver,
		createUniversalRoot,
		defineUniversalComponent,
		universalComponent,
		universalPlan,
		universalValue,
		universalTry,
		universalActivity,
		useMemo,
		use,
		flushUniversalSync,
	} = runtime;
	const plan = universalPlan('object', { kind: 'host', type: 'cell', bindings: [['value', 0]] });
	const requests = [];
	const identities = [];
	const ids = Array.from({ length: size }, (_, id) => id);
	const Child = defineUniversalComponent('object', ({ id }) => {
		const promise = useMemo(
			() => {
				let accept;
				const value = new Promise((resolve) => {
					accept = resolve;
				});
				requests.push({ id, value, accept });
				return value;
			},
			[id],
			'request',
		);
		identities[id] = promise;
		return universalValue(plan, [mode === 'ready' ? `value-${id}` : use(promise)]);
	});
	const Scene = defineUniversalComponent('object', () =>
		ids.map((id) => {
			const child = () => universalComponent('object', Child, { id }, id);
			return mode === 'activity'
				? universalActivity('hidden', child)
				: universalTry(child, () => null);
		}),
	);
	const container = createObjectContainer('object');
	const root = createUniversalRoot(container, createObjectDriver('object'));
	const start = performance.now();
	const attempt = root.render(Scene, {});
	const renderMs = performance.now() - start;
	assert.equal(attempt.status, 'committed');
	assert.equal(requests.length, size);
	assert.equal(container.instanceCount, mode === 'ready' ? size : 0);
	let replayMs = 0;
	if (mode !== 'ready') {
		const begin = performance.now();
		for (const request of requests) request.accept(`value-${request.id}`);
		await Promise.all(requests.map((request) => request.value));
		flushUniversalSync(() => {});
		await root.flushTransport();
		replayMs = performance.now() - begin;
	}
	assert.equal(requests.length, size, 'Replay must not recreate requests');
	for (const request of requests) assert.equal(identities[request.id], request.value);
	assert.equal(container.instanceCount, size);
	assert.deepEqual(
		container.children.map((node) => node.props.value),
		ids.map((id) => `value-${id}`),
	);
	root.unmount();
	assert.equal(container.instanceCount, 0);
	return { renderMs, replayMs, totalMs: renderMs + replayMs };
}
const release = acquireBenchmarkLock();
try {
	const runtimes = [];
	for (const source of sources) runtimes.push(await bundle(source));
	for (const size of [8, 128, 2048]) {
		for (const mode of ['boundary', 'activity', 'ready']) {
			const pairs = [];
			for (let iteration = -3; iteration < samples; iteration++) {
				const pair = [];
				for (const index of iteration % 2 === 0 ? [0, 1] : [1, 0]) {
					pair[index] = await workload(runtimes[index], size, mode);
				}
				if (iteration >= 0) pairs.push(pair);
			}
			const baseline = pairs.map((pair) => pair[0].totalMs);
			const candidate = pairs.map((pair) => pair[1].totalMs);
			const row = {
				size,
				mode,
				pairs,
				baseline: summarizeSamples(baseline),
				candidate: summarizeSamples(candidate),
				paired: pairedRatio(baseline, candidate),
			};
			report.results.push(row);
			console.log(JSON.stringify(row));
		}
	}
	if (process.env.BENCH_JSON)
		writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
} finally {
	release();
}
