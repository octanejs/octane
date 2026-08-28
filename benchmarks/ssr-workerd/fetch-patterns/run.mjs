import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { octane } from 'octane/compiler/vite';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { semanticHtmlForVerification } from '../../lib/stream-verify.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '../../..');
const outDir = path.resolve(root, '../dist/fetch-patterns');
const iterations = Number(process.argv[2] ?? 7);
const rounds = Number(process.env.BENCH_ROUNDS ?? 3);
const delay = Number(process.env.BENCH_DELAY_MS ?? 20);
assert(Number.isInteger(iterations) && iterations > 0);
assert(Number.isInteger(rounds) && rounds > 0);
assert(Number.isFinite(delay) && delay >= 0);

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

const cases = [];
for (const shell of [false, true]) {
	for (const pattern of ['local', 'inline', 'memo', 'prepared', 'use-site']) {
		cases.push({ name: `${pattern}/${shell ? 'shell' : 'blocked'}`, pattern, shell, count: 10 });
	}
	cases.push({
		name: `local-request-cache/${shell ? 'shell' : 'blocked'}`,
		pattern: 'local',
		shell,
		count: 10,
		cache: 'request',
	});
	for (const pattern of ['serial', 'parallel', 'independent', 'dependent']) {
		cases.push({ name: `${pattern}/${shell ? 'shell' : 'blocked'}`, pattern, shell, count: 3 });
	}
}
cases.push(
	{ name: 'local/per-card', pattern: 'local', shell: true, each: true, count: 10 },
	{ name: 'inline/per-card', pattern: 'inline', shell: true, each: true, count: 10 },
	{ name: 'prepared/per-card', pattern: 'prepared', shell: true, each: true, count: 10 },
	{ name: 'use-site/per-card', pattern: 'use-site', shell: true, each: true, count: 10 },
	{ name: 'duplicate/no-cache', pattern: 'use-site', shell: false, count: 10, unique: 3 },
	{
		name: 'duplicate/request-cache',
		pattern: 'use-site',
		shell: false,
		count: 10,
		unique: 3,
		cache: 'request',
	},
	{
		name: 'duplicate/no-cache-per-card',
		pattern: 'use-site',
		shell: true,
		each: true,
		count: 10,
		unique: 3,
	},
	{
		name: 'duplicate/request-cache-per-card',
		pattern: 'use-site',
		shell: true,
		each: true,
		count: 10,
		unique: 3,
		cache: 'request',
	},
	{
		name: 'data-cache/cold',
		pattern: 'parallel',
		shell: false,
		count: 3,
		cache: 'data',
		cold: true,
	},
	{
		name: 'data-cache/warm',
		pattern: 'parallel',
		shell: false,
		count: 3,
		cache: 'data',
		warm: true,
	},
);

const selected = process.env.CASES
	? cases.filter((c) => process.env.CASES.split(',').some((name) => c.name.includes(name)))
	: cases;
assert(selected.length > 0, 'No matching cases');
let sequence = 0;

async function dispatch(urlPath) {
	return mf.dispatchFetch(`https://bench.local${urlPath}`, {
		headers: { 'accept-encoding': 'identity' },
	});
}

async function clearCache() {
	const response = await dispatch('/clear-cache');
	assert.equal(await response.text(), 'ok');
}

function resolvedArticles(html) {
	const semantic = semanticHtmlForVerification('octane', html).replace(/<!--[\s\S]*?-->/g, '');
	return [...semantic.matchAll(/<article\b([^>]*)>([^<]*)<\/article>/g)].map((match) => ({
		id: match[1].match(/\bdata-item="(\d+)"/)?.[1],
		label: match[2],
	}));
}

async function sample(config, tenant = 'public') {
	const id = String(sequence++);
	const params = new URLSearchParams({
		id,
		tenant,
		pattern: config.pattern,
		shell: config.shell ? '1' : '0',
		each: config.each ? '1' : '0',
		count: String(config.count),
		unique: String(config.unique ?? config.count),
		delay: String(delay),
		cache: config.cache ?? 'none',
	});
	const chunks = [];
	const start = performance.now();
	const response = await dispatch(`/?${params}`);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value?.byteLength)
			chunks.push({ ms: performance.now() - start, text: decoder.decode(value, { stream: true }) });
	}
	const total = performance.now() - start;
	reader.releaseLock();
	assert.equal(response.status, 200, chunks.map((chunk) => chunk.text).join(''));
	const html = chunks.map((chunk) => chunk.text).join('');
	const expected = Array.from(
		{ length: config.count },
		(_, i) => `${tenant}:${i % (config.unique ?? config.count)}`,
	);
	const articles = resolvedArticles(html);
	if (config.each) {
		// Independent boundaries can resolve in any wire order. Validate unique
		// keyed payloads, not arrival order as a proxy for their eventual placement.
		assert.deepEqual(
			articles.sort((a, b) => Number(a.id) - Number(b.id)),
			expected.map((label, id) => ({ id: String(id), label })),
			`${config.name}: keyed output`,
		);
	} else {
		assert.deepEqual(
			articles.map((article) => article.label),
			expected,
			`${config.name}: full output`,
		);
	}
	assert.equal((html.match(/<h1>Fetch patterns<\/h1>/g) ?? []).length, 1);
	let accumulated = '';
	let firstData;
	for (const chunk of chunks) {
		accumulated += chunk.text;
		if (firstData === undefined && resolvedArticles(accumulated).length > 0) firstData = chunk.ms;
	}
	assert(firstData !== undefined, `${config.name}: no resolved article`);
	if (config.shell && delay >= 10 && !config.warm) {
		assert(chunks[0].text.includes('class="pending"'), `${config.name}: missing pending shell`);
		assert.equal(resolvedArticles(chunks[0].text).length, 0, `${config.name}: buffered shell`);
	}
	let stats;
	for (let poll = 0; poll < 100; poll++) {
		stats = await (await dispatch(`/stats?id=${id}`)).json();
		assert(stats !== null, 'Missing request stats');
		if (stats.done) break;
		await new Promise((resolve) => setTimeout(resolve, 2));
	}
	assert(stats.done, 'Orphaned request work did not settle');
	assert.deepEqual(stats.errors, [], `${config.name}: render errors`);
	assert.equal(stats.active, 0);
	return { ttfb: chunks[0].ms, firstData, total, ...stats };
}

async function runSample(config, tenant) {
	if (config.cold || config.warm) await clearCache();
	if (config.warm) await sample(config, tenant);
	const result = await sample(config, tenant);
	if (config.warm) assert.equal(result.backendCalls, 0, 'Warm cache made a backend call');
	if (config.cold) assert.equal(result.backendCalls, 3, 'Cold cache skipped backend work');
	if (config.pattern === 'local' && config.cache === 'request') {
		assert.equal(
			result.backendCalls,
			config.count,
			'Request cache did not stabilize recreated promises',
		);
	}
	if (config.pattern === 'serial' || config.pattern === 'dependent') {
		assert.equal(result.maxActive, 1, 'A true serial dependency overlapped backend calls');
	}
	if ((config.pattern === 'parallel' || config.pattern === 'independent') && !config.warm) {
		assert.equal(result.maxActive, 3, 'Independent backend calls did not overlap');
	}
	if (
		['prepared', 'inline', 'use-site', 'serial', 'parallel', 'independent', 'dependent'].includes(
			config.pattern,
		) &&
		!config.warm
	) {
		assert.equal(
			result.backendCalls,
			config.cache === 'request' ? (config.unique ?? config.count) : config.count,
			`${config.name}: unexpected duplicate fetches`,
		);
	}
	return result;
}

function summarize(samples, key) {
	const values = samples.map((sample) => sample[key]).sort((a, b) => a - b);
	return {
		median: values[Math.floor(values.length / 2)],
		min: values[0],
		max: values.at(-1),
		mean: values.reduce((a, b) => a + b, 0) / values.length,
		p95: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))],
	};
}

const records = new Map(selected.map((config) => [config.name, []]));
try {
	await mf.ready;
	// Cross-request and concurrent isolation checks, including the persistent
	// data cache. Each tenant must see only its own labels in the real stream.
	await clearCache();
	const isolation = {
		pattern: 'parallel',
		shell: false,
		count: 3,
		cache: 'data',
		name: 'isolation',
	};
	const isolated = await Promise.all([sample(isolation, 'alice'), sample(isolation, 'bob')]);
	assert.deepEqual(
		isolated.map((s) => s.backendCalls),
		[3, 3],
	);
	assert.equal((await sample(isolation, 'alice')).backendCalls, 0);
	assert.equal((await sample(isolation, 'bob')).backendCalls, 0);
	await clearCache();
	for (const config of selected) for (let i = 0; i < 2; i++) await runSample(config);
	// Reverse the case order across rounds to avoid confounding a candidate
	// with a later, warmer part of the same workerd process.
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

const results = selected.map((config) => {
	const samples = records.get(config.name);
	return {
		config,
		stats: Object.fromEntries(
			[
				'ttfb',
				'firstData',
				'total',
				'parentPasses',
				'backendCalls',
				'loads',
				'cacheHits',
				'maxActive',
			].map((key) => [key, summarize(samples, key)]),
		),
		samples,
	};
});
const report = {
	suite: 'ssr-workerd-fetch-patterns',
	completedAt: new Date().toISOString(),
	scope:
		'production-compiled Octane SSR in real workerd; separate workerd backend service; no app-core or adapter wrapper',
	commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
	fixtureSha256: Object.fromEntries(
		['Pages.tsrx', 'data.ts', 'worker.ts', 'backend.js', 'run.mjs'].map((file) => [
			file,
			createHash('sha256')
				.update(fs.readFileSync(path.join(root, file)))
				.digest('hex'),
		]),
	),
	environment: {
		node: process.version,
		platform: os.platform(),
		arch: os.arch(),
		cpu: os.cpus()[0]?.model,
		compatibilityDate,
	},
	iterations,
	rounds,
	delay,
	workerBytes: fs.statSync(path.join(outDir, 'worker.js')).size,
	results,
};
const destination =
	process.env.BENCH_JSON ?? path.resolve(repo, 'benchmarks/results/cloudflare-fetch-patterns.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
console.log('case                              TTFB ms  first data  total ms  passes  fetches');
for (const { config, stats } of results) {
	console.log(
		`${config.name.padEnd(33)} ${stats.ttfb.median.toFixed(2).padStart(8)} ${stats.firstData.median.toFixed(2).padStart(11)} ${stats.total.median.toFixed(2).padStart(9)} ${String(stats.parentPasses.median).padStart(7)} ${String(stats.backendCalls.median).padStart(8)}`,
	);
}
console.log(`Raw samples: ${destination}`);
