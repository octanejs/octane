// Production browser sidecar for runtime-descriptor streaming. The compiled
// cross-framework chat fixture remains unchanged and serves as a separate guard.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = import.meta.dirname;
const RUNNER_REPO = path.resolve(HERE, '../..');
const SOURCE_REPO = path.resolve(process.env.DESCRIPTOR_STREAM_ROOT || RUNNER_REPO);
const DEPENDENCY_REPO = path.resolve(process.env.DESCRIPTOR_STREAM_EXTERNAL_ROOT || RUNNER_REPO);
const OCTANE = path.join(SOURCE_REPO, 'packages/octane');
const ENTRY = path.join(HERE, 'descriptor-entry.ts');
const BUILD_ONLY = process.argv.includes('--build-only');
const ITERATIONS = Number(process.argv.slice(2).find((arg) => arg !== '--build-only') || 12);
assert(Number.isInteger(ITERATIONS) && ITERATIONS > 0, 'iterations must be a positive integer');
const WARMUPS = 3;
const OPS = [
	{ name: 'hosts_fine', mode: 'hosts', batch: 8 },
	{ name: 'hosts_coarse', mode: 'hosts', batch: 64 },
	{ name: 'components_fine', mode: 'components', batch: 8 },
	{ name: 'text_control', mode: 'text', batch: 8 },
];
const requireDependencies = createRequire(
	path.join(DEPENDENCY_REPO, 'packages/octane/package.json'),
);
const { build, version: esbuildVersion } = requireDependencies('esbuild');
const { chromium } = createRequire(
	path.join(DEPENDENCY_REPO, 'benchmarks/chat-stream/package.json'),
)('playwright');
// Keep this fixture's hook transformation and dependencies fixed when selecting
// another runtime checkout; the source-root override measures runtime changes.
const compilerFile = path.join(DEPENDENCY_REPO, 'packages/octane/src/compiler/slot-hooks.js');
const { slotHooks } = await import(pathToFileURL(compilerFile).href);
const exportsMap = JSON.parse(fs.readFileSync(path.join(OCTANE, 'package.json'), 'utf8')).exports;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function sourceHash(directory) {
	const hash = createHash('sha256');
	function visit(current) {
		const entries = fs
			.readdirSync(current, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			const filename = path.join(current, entry.name);
			if (entry.isDirectory()) visit(filename);
			else if (entry.isFile()) {
				hash.update(path.relative(directory, filename));
				hash.update('\0');
				hash.update(fs.readFileSync(filename));
				hash.update('\0');
			}
		}
	}
	visit(directory);
	return hash.digest('hex');
}

function sourceCommit() {
	try {
		return execFileSync('git', ['-C', SOURCE_REPO, 'rev-parse', 'HEAD'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return null;
	}
}

async function bundle(outfile) {
	await build({
		entryPoints: [ENTRY],
		absWorkingDir: RUNNER_REPO,
		outfile,
		bundle: true,
		minify: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [
			path.join(DEPENDENCY_REPO, 'packages/octane/node_modules'),
			path.join(DEPENDENCY_REPO, 'node_modules'),
		],
		plugins: [
			{
				name: 'descriptor-stream-runtime',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const entry =
							exportsMap[request === 'octane' ? '.' : './' + request.slice('octane/'.length)];
						const target = typeof entry === 'string' ? entry : entry?.import || entry?.default;
						assert.equal(typeof target, 'string', `unmapped runtime import ${request}`);
						return { path: path.resolve(OCTANE, target) };
					});
					plugin.onLoad({ filter: /descriptor-entry\.ts$/ }, ({ path: filename }) => {
						if (filename !== ENTRY) return null;
						const source = fs.readFileSync(filename, 'utf8');
						const slotted = slotHooks(source, filename, {
							environment: 'client',
							hmr: false,
							profile: false,
						});
						return { contents: slotted?.code ?? source, loader: 'ts', resolveDir: HERE };
					});
				},
			},
		],
	});
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-descriptor-stream-'));
let browser;
let server;
try {
	const output = path.join(directory, 'entry.js');
	await bundle(output);
	const code = fs.readFileSync(output);
	const meta = {
		node: process.version,
		esbuild: esbuildVersion,
		sourceCommit: sourceCommit(),
		sourceRoot: SOURCE_REPO,
		dependencyRoot: DEPENDENCY_REPO,
		sourceSha256: sourceHash(path.join(OCTANE, 'src')),
		entrySha256: sha256(fs.readFileSync(ENTRY)),
		runnerSha256: sha256(fs.readFileSync(import.meta.filename)),
		corpusSha256: sha256(fs.readFileSync(path.join(HERE, 'octane-tsrx/src/data.js'))),
		compilerSha256: sha256(fs.readFileSync(compilerFile)),
		lockfileSha256: sha256(fs.readFileSync(path.join(DEPENDENCY_REPO, 'pnpm-lock.yaml'))),
		bundleSha256: sha256(code),
		bundleBytes: code.length,
		warmups: WARMUPS,
		measurement:
			'synchronous elapsed rendering and descriptor-projection time for a complete production stream, excluding mount, first chunk, parsing, paint, network pacing and semantic checks',
	};
	if (BUILD_ONLY) {
		console.log(
			JSON.stringify({ suite: 'chat-stream-descriptors', buildOnly: true, meta }, null, '\t'),
		);
	} else {
		const html =
			'<!doctype html><html><body><textarea id="composer">a draft kept while the response streams</textarea><main id="root"></main><script type="module" src="/entry.js"></script></body></html>';
		server = http.createServer((request, response) => {
			if (request.url === '/entry.js') {
				response.writeHead(200, { 'content-type': 'text/javascript' });
				response.end(code);
			} else if (request.url === '/') {
				response.writeHead(200, { 'content-type': 'text/html' });
				response.end(html);
			} else {
				response.writeHead(404);
				response.end();
			}
		});
		await new Promise((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		browser = await chromium.launch({
			headless: true,
			args: ['--disable-extensions', '--js-flags=--expose-gc'],
		});
		meta.chromium = browser.version();
		const results = {};
		const semantics = {};
		for (const op of OPS) {
			const context = await browser.newContext();
			try {
				const page = await context.newPage();
				const errors = [];
				page.on('pageerror', (error) => errors.push(error.message));
				await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
				const semantic = await page.evaluate(
					({ mode, batch }) => window.__descriptorStream.semanticPass(mode, batch),
					op,
				);
				semantics[op.name] = { ...semantic, text: undefined, textSha256: sha256(semantic.text) };
				for (let i = 0; i < WARMUPS; i++) {
					await page.evaluate(
						({ mode, batch }) => window.__descriptorStream.sample(mode, batch),
						op,
					);
				}
				const samples = [];
				for (let i = 0; i < ITERATIONS; i++) {
					const measured = await page.evaluate(({ mode, batch }) => {
						return window.__descriptorStream.sample(mode, batch);
					}, op);
					assert.equal(measured.chunks, semantic.chunks, 'sample changed the stream length');
					samples.push(measured.ms);
				}
				assert.deepEqual(errors, [], 'production browser reported errors');
				const stat = summarizeSamples(samples);
				results[op.name] = { ...timingStatForJson(stat), rawSamplesMs: samples };
				console.log(
					`${op.name.padEnd(18)} ${stat.median.toFixed(2).padStart(8)} ms median; ${stat.score.toFixed(2)} ms score, ${stat.scoreRme.toFixed(1)}% RME`,
				);
			} finally {
				await context.close();
			}
		}
		const payload = {
			suite: 'chat-stream-descriptors',
			iterations: ITERATIONS,
			targets: [{ name: 'octane', results, meta: { ...meta, semantics, ops: OPS } }],
		};
		if (process.env.BENCH_JSON) {
			fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
			console.log(`BENCH_JSON written to ${process.env.BENCH_JSON}`);
		}
	}
} finally {
	await browser?.close();
	if (server?.listening) await new Promise((resolve) => server.close(resolve));
	fs.rmSync(directory, { recursive: true, force: true });
}
