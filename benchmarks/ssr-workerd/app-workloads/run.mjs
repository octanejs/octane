import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { build } from 'vite';
import { octane } from 'octane/compiler/vite';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { summarizeSamples } from '../../lib/stats.mjs';
import { contentPresent, verifyGatePrefix, verifyOutput, verifyStats } from './verify.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '../../..');
const outDir = path.resolve(root, '../dist/app-workloads');
const iterations = Number(process.argv[2] ?? 7);
const rounds = Number(process.env.BENCH_ROUNDS ?? 3);
const delay = Number(process.env.BENCH_DELAY_MS ?? 15);
const scale = Number(process.env.BENCH_SCALE ?? 1);
assert(Number.isInteger(iterations) && iterations > 0, 'Invalid iterations');
assert(Number.isInteger(rounds) && rounds > 0, 'Invalid rounds');
assert(Number.isFinite(delay) && delay >= 0 && delay <= 100, 'Invalid delay');
assert(Number.isInteger(scale) && scale >= 1 && scale <= 4, 'Invalid scale');

await build({
	root,
	configFile: false,
	logLevel: 'warn',
	plugins: [octane()],
	build: { ssr: 'worker.ts', outDir, emptyOutDir: true, minify: true, target: 'esnext' },
	ssr: { target: 'webworker', noExternal: true },
});
const compatibilityDate = '2026-07-14';
const mf = new Miniflare({
	log: new Log(LogLevel.ERROR),
	defaultPersistRoot: path.join(outDir, '.miniflare'),
	workers: [
		{
			name: 'render',
			modules: true,
			scriptPath: path.join(outDir, 'worker.js'),
			modulesRules: [{ type: 'ESModule', include: ['**/*.js'], fallthrough: true }],
			compatibilityDate,
			compatibilityFlags: ['nodejs_compat'],
			serviceBindings: { BACKEND: 'backend' },
		},
		{
			name: 'backend',
			modules: true,
			scriptPath: path.join(root, 'backend.js'),
			compatibilityDate,
		},
	],
});

const cases = ['workspace', 'history'].flatMap((scenario) => [
	{ name: `${scenario}/zero-delay`, scenario, delay: 0, warm: false },
	{ name: `${scenario}/io`, scenario, delay, warm: false },
	{ name: `${scenario}/io-blocked-root`, scenario, delay, warm: false, streamShell: false },
	{ name: `${scenario}/warm-data`, scenario, delay, warm: true },
]);
const selected = process.env.CASES
	? cases.filter((config) =>
			process.env.CASES.split(',').some((name) => config.name.includes(name)),
		)
	: cases;
assert(selected.length > 0, 'No matching cases');
let sequence = 0;

async function dispatch(urlPath) {
	return mf.dispatchFetch(`https://bench.local${urlPath}`, {
		headers: { 'accept-encoding': 'identity' },
	});
}
async function control(pathname) {
	assert.equal(await (await dispatch(pathname)).text(), 'ok');
}
async function deadline(job) {
	let timer;
	try {
		return await Promise.race([
			job,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error('Sample exceeded 10s')), 10_000);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

async function sample(config, tenant = 'sample', gate = '') {
	const id = `request-${sequence++}`;
	const sampleScale = config.scale ?? scale;
	const params = new URLSearchParams({
		id,
		tenant,
		scenario: config.scenario,
		scale: String(sampleScale),
		delay: String(config.delay),
		cache: config.warm ? 'data' : 'request',
		gate,
		streamShell: config.streamShell === false ? '0' : '1',
	});
	const chunks = [];
	let reader;
	let gateReleased = false;
	let gatedHtml = '';
	const gateDecoder = new TextDecoder();
	try {
		// No loader preparation, fetching, parsing or data generation is hidden
		// before this clock. Only an explicitly labelled warm-data prime is outside.
		const start = performance.now();
		const response = await dispatch(`/?${params}`);
		assert(response.body, 'Missing response body');
		reader = response.body.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value?.byteLength) continue;
			chunks.push({ ms: performance.now() - start, value });
			// Untimed correctness preflights only. Timed samples retain raw bytes
			// and do not decode/parse their HTML in the consumption loop.
			if (gate && !gateReleased) {
				gatedHtml += gateDecoder.decode(value, { stream: true });
				if (verifyGatePrefix(gatedHtml, { scenario: config.scenario, gate })) {
					await control(`/release?id=${id}`);
					gateReleased = true;
				}
			}
		}
		const total = performance.now() - start;
		reader.releaseLock();
		reader = undefined;
		assert.equal(response.status, 200);
		assert(chunks.length > 0, 'Empty response');
		if (gate) assert(gateReleased, 'Stream ended before gate release');

		// All payload decoding and counters are outside the timed window.
		const decoder = new TextDecoder();
		let html = '';
		let firstContent;
		for (const chunk of chunks) {
			html += decoder.decode(chunk.value, { stream: true });
			if (firstContent === undefined && contentPresent(html, config.scenario))
				firstContent = chunk.ms;
		}
		html += decoder.decode();
		const output = verifyOutput(html, { scenario: config.scenario, tenant, scale: sampleScale });
		assert(firstContent !== undefined, 'No primary content milestone');
		let stats;
		for (let poll = 0; poll < 200; poll++) {
			stats = await (await dispatch(`/stats?id=${id}`)).json();
			assert(stats, 'Missing request stats');
			if (stats.done) break;
			await new Promise((resolve) => setTimeout(resolve, 2));
		}
		assert(stats.done, 'Request work did not drain');
		return {
			ttfb: chunks[0].ms,
			firstContent,
			total,
			wireBytes: chunks.reduce((sum, chunk) => sum + chunk.value.byteLength, 0),
			chunkCount: chunks.length,
			proofCount: output.proofCount,
			...stats,
		};
	} finally {
		if (gate) await control(`/reset?id=${id}`);
		if (reader) await reader.cancel().catch(() => {});
	}
}

async function runSample(config, tenant = 'sample') {
	if (config.warm) {
		await control('/clear-cache');
		const prime = await deadline(sample(config, tenant));
		verifyStats(prime, { ...config, tenant, warm: false });
	}
	const result = await deadline(sample(config, tenant));
	verifyStats(result, { ...config, tenant });
	return result;
}

const records = new Map(selected.map((config) => [config.name, []]));
try {
	await mf.ready;
	for (const scenario of new Set(selected.map((config) => config.scenario))) {
		const config = { scenario, delay: 0, warm: false };
		// Backend response gates establish streaming without a flaky millisecond
		// threshold: initial shell before all data; primary content before tail data.
		for (const gate of ['shell', 'tail']) {
			const result = await deadline(sample(config, 'gate-check', gate));
			verifyStats(result, { ...config, tenant: 'gate-check' });
		}
		// Concurrent cold tenants, warm tenants and a changed input size are never
		// inferred from timing: complete labels and the actual backend keys are checked.
		await control('/clear-cache');
		const isolation = { ...config, warm: true };
		const tenants = ['tenant-a', 'tenant-b'];
		const cold = await Promise.all(tenants.map((tenant) => deadline(sample(isolation, tenant))));
		cold.forEach((result, index) => verifyStats(result, { ...config, tenant: tenants[index] }));
		const warm = await Promise.all(tenants.map((tenant) => deadline(sample(isolation, tenant))));
		warm.forEach((result, index) => verifyStats(result, { ...isolation, tenant: tenants[index] }));
		const resized = { ...isolation, scale: scale === 4 ? 1 : scale + 1 };
		verifyStats(await deadline(sample(resized, tenants[0])), { ...config, tenant: tenants[0] });
		verifyStats(await deadline(sample(isolation, tenants[0])), {
			...isolation,
			tenant: tenants[0],
		});
		await control('/clear-cache');
	}
	for (const config of selected) for (let i = 0; i < 2; i++) await runSample(config);
	for (let round = 0; round < rounds; round++) {
		const ordered = round % 2 ? [...selected].reverse() : selected;
		for (const config of ordered) {
			for (let i = 0; i < iterations; i++)
				records.get(config.name).push({ round, ...(await runSample(config)) });
			console.error(`round ${round + 1}/${rounds}: ${config.name}`);
		}
	}
} finally {
	await mf.dispose();
}

const metrics = [
	'ttfb',
	'firstContent',
	'total',
	'wireBytes',
	'chunkCount',
	'proofCount',
	'bootstrapPasses',
	'loads',
	'requestHits',
	'dataHits',
	'backendCalls',
	'maxActive',
];
const results = selected.map((config) => {
	const samples = records.get(config.name);
	return {
		config: { ...config, scale },
		stats: Object.fromEntries(
			metrics.map((key) => [
				key,
				summarizeSamples(
					samples.map((s) => s[key]),
					{ scoreMode: 'mean' },
				),
			]),
		),
		samples,
	};
});
const worker = fs.readFileSync(path.join(outDir, 'worker.js'));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function version(name, resolver = import.meta.resolve) {
	// Some dependencies intentionally do not export their package.json.
	const resolved = resolver(name);
	let directory = path.dirname(resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved);
	while (directory !== path.dirname(directory)) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest)) {
			const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
			if (pkg.name === name) return pkg.version;
		}
		directory = path.dirname(directory);
	}
	throw new Error(`Could not record installed version: ${name}`);
}
const report = {
	suite: 'ssr-workerd-app-workloads',
	completedAt: new Date().toISOString(),
	scope:
		'Synthetic production-compiled Octane SSR in workerd with a local backend service binding; not the app-core/Cloudflare adapter wrapper, browser paint, hydration, or a production workload measurement.',
	commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
	fixtureSha256: Object.fromEntries(
		[
			'Pages.tsrx',
			'data.ts',
			'worker.ts',
			'backend.js',
			'run.mjs',
			'verify.mjs',
			'../../lib/stream-verify.mjs',
			'../../lib/stats.mjs',
		].map((file) => [file, hash(path.join(root, file))]),
	),
	runtimeSha256: hash(path.join(repo, 'packages/octane/src/runtime.server.ts')),
	lockfileSha256: hash(path.join(repo, 'pnpm-lock.yaml')),
	environment: {
		node: process.version,
		platform: os.platform(),
		arch: os.arch(),
		cpu: os.cpus()[0]?.model,
		compatibilityDate,
		vite: version('vite'),
		miniflare: version('miniflare'),
		workerd: version('workerd', createRequire(import.meta.resolve('miniflare')).resolve),
		tsrx: version('@tsrx/core'),
	},
	iterations,
	rounds,
	delay,
	scale,
	warmupsPerCase: 2,
	workerBytes: worker.byteLength,
	workerGzipBytes: gzipSync(worker).byteLength,
	results,
};
const destination =
	process.env.BENCH_JSON ?? path.resolve(repo, 'benchmarks/results/ssr-workerd-app-workloads.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
console.log('case                         TTFB ms  content ms  total ms  fetches  wire KiB');
for (const { config, stats } of results) {
	console.log(
		`${config.name.padEnd(28)} ${stats.ttfb.median.toFixed(2).padStart(7)} ${stats.firstContent.median.toFixed(2).padStart(11)} ${stats.total.median.toFixed(2).padStart(9)} ${String(stats.backendCalls.median).padStart(8)} ${(stats.wireBytes.median / 1024).toFixed(1).padStart(9)}`,
	);
}
console.log(`Raw samples: ${destination}`);
