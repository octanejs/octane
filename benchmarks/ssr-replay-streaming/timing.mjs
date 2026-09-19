// Optional paired latency control using the existing compiled storefront.
// No source observers, output parsing, or assertions run in the timed region.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { verifyStream } from '../lib/stream-verify.mjs';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = require('esbuild');
const { compile } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/index.js'))
);
const temporary = mkdtempSync(path.join(tmpdir(), 'octane-ssr-paired-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const rounds = Number(process.env.SSR_TIMING_ROUNDS || 31);
assert.ok(Number.isSafeInteger(rounds) && rounds > 0);
assert.ok(
	process.env.SSR_BASELINE_ROOT,
	'SSR_BASELINE_ROOT must point at a frozen baseline source tree',
);

async function bundle(sourceRoot, label) {
	const runtimePath = path.join(sourceRoot, 'packages/octane/src/runtime.server.ts');
	const outfile = path.join(temporary, `${label}.mjs`);
	await build({
		entryPoints: [path.join(repo, 'benchmarks/streaming-ssr/octane/src/entry-server.ts')],
		outfile,
		bundle: true,
		minify: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		define: { 'process.env.NODE_ENV': '"production"' },
		nodePaths: [path.join(repo, 'packages/octane/node_modules'), path.join(repo, 'node_modules')],
		plugins: [
			{
				name: 'server-source',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/server)?$/ }, () => ({
						path: path.join(sourceRoot, 'packages/octane/src/server/index.ts'),
					}));
					plugin.onLoad({ filter: /\.tsrx$/ }, ({ path: filename }) => ({
						contents: compile(readFileSync(filename, 'utf8'), filename, {
							mode: 'server',
							hmr: false,
						}).code,
						loader: 'js',
						resolveDir: path.dirname(filename),
					}));
				},
			},
		],
	});
	const code = readFileSync(outfile);
	return {
		runtime: await import(pathToFileURL(outfile)),
		meta: {
			sourceHash: hash(readFileSync(runtimePath)),
			bundleHash: hash(code),
			bytes: code.length,
			gzip: gzipSync(code).length,
		},
	};
}

async function verify(runtime, cards, wave) {
	const chunks = [];
	await runtime.renderControlledStream(cards, wave, (chunk) => chunks.push(chunk));
	const html = chunks.join('');
	verifyStream('octane', 'cpu', { html, firstChunk: chunks[0] }, cards);
	assert.ok(!chunks[0].includes('class="card"'), 'the shell precedes the product payload');
	// The wire intentionally has a fresh request/module token. Normalize only
	// the observed boundary IDs, retaining every payload and transport byte.
	const ids = [...html.matchAll(/<template data-oct-b="([^"]+)"/g)].map((match) => match[1]);
	let normalized = html;
	for (const [index, id] of ids.entries())
		normalized = normalized.replaceAll('"' + id + '"', '"boundary-' + index + '"');
	return { html: normalized, bytes: Buffer.byteLength(html), chunks: chunks.length };
}

async function sample(runtime, cards, wave) {
	let bytes = 0;
	let chunks = 0;
	const start = performance.now();
	await runtime.renderControlledStream(cards, wave, (chunk) => {
		bytes += Buffer.byteLength(chunk);
		chunks++;
	});
	return { elapsed: performance.now() - start, bytes, chunks };
}

try {
	const baseline = await bundle(path.resolve(process.env.SSR_BASELINE_ROOT), 'baseline');
	const candidate = await bundle(path.resolve(process.env.SSR_SOURCE_ROOT || repo), 'candidate');
	const targets = [];
	for (const [cards, wave] of [
		[10, 10],
		[100, 100],
		[800, 800],
		[50, 5],
	]) {
		const expected = await verify(baseline.runtime, cards, wave);
		assert.deepEqual(
			await verify(candidate.runtime, cards, wave),
			expected,
			'wire response is unchanged apart from request IDs',
		);
		for (let i = 0; i < 10; i++) {
			await sample(baseline.runtime, cards, wave);
			await sample(candidate.runtime, cards, wave);
		}
		const values = { baseline: [], candidate: [] };
		for (let round = 0; round < rounds; round++) {
			const order = round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
			let pairedBytes;
			for (const name of order) {
				const result = await sample(
					name === 'baseline' ? baseline.runtime : candidate.runtime,
					cards,
					wave,
				);
				if (pairedBytes === undefined) pairedBytes = result.bytes;
				else assert.equal(result.bytes, pairedBytes);
				assert.equal(result.chunks, expected.chunks);
				values[name].push(result.elapsed);
			}
		}
		const stats = (samples) => {
			const sorted = samples.toSorted((a, b) => a - b);
			return {
				median: sorted[Math.floor(sorted.length / 2)],
				min: sorted[0],
				max: sorted.at(-1),
				samples,
			};
		};
		targets.push({
			cards,
			wave,
			outputHash: hash(expected.html),
			bytes: expected.bytes,
			chunks: expected.chunks,
			baseline: stats(values.baseline),
			candidate: stats(values.candidate),
		});
	}
	const result = {
		node: process.version,
		v8: process.versions.v8,
		platform: process.platform,
		arch: process.arch,
		warmups: 10,
		rounds,
		baseline: baseline.meta,
		candidate: candidate.meta,
		targets,
	};
	console.log(JSON.stringify(result, null, 2));
	if (process.env.BENCH_JSON)
		writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
