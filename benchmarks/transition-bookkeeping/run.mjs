// Production Chromium timing and a separate, untimed constructor/lookup census.
process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../..');
const PACKAGE = path.join(REPO, 'packages/octane');
const requirePackage = createRequire(path.join(PACKAGE, 'package.json'));
const { build, version: esbuildVersion } = requirePackage('esbuild');
const { chromium } = createRequire(path.join(REPO, 'package.json'))('playwright');
const { compile } = await import(pathToFileURL(path.join(PACKAGE, 'src/compiler/index.js')));
const exportsMap = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')).exports;
const scenarios = ['urgent', 'single-owner', 'repeat-owner', 'two-owners', 'two-updates'];
const iterations = Number(process.argv[2] ?? 40);
const workOnly = process.env.OCTANE_TRANSITION_WORK_ONLY === '1';
const baselineRevision = process.env.OCTANE_TRANSITION_BASELINE;
const warmupCycles = 1_000;
const sampleCycles = Number(process.env.OCTANE_TRANSITION_SAMPLE_CYCLES ?? 500);
const workCycles = 100;
const countStat = (score) => ({ score, median: score, min: score, samples: 1 });
const hash = (value) => createHash('sha256').update(value).digest('hex');
if (!Number.isSafeInteger(iterations) || iterations < 1)
	throw new Error('Expected positive iterations');
if (!Number.isSafeInteger(sampleCycles) || sampleCycles < 1)
	throw new Error('OCTANE_TRANSITION_SAMPLE_CYCLES must be a positive safe integer');

const versions = [
	{ name: 'current', runtime: fs.readFileSync(path.join(PACKAGE, 'src/runtime.ts'), 'utf8') },
];
if (baselineRevision) {
	versions.unshift({
		name: 'baseline',
		runtime: execFileSync('git', ['show', `${baselineRevision}:packages/octane/src/runtime.ts`], {
			cwd: REPO,
			encoding: 'utf8',
			maxBuffer: 8 * 1024 * 1024,
		}),
	});
}

async function buildBundle(version) {
	const result = await build({
		entryPoints: [path.join(HERE, 'entry.ts')],
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		minify: true,
		define: { 'process.env.NODE_ENV': '"production"' },
		nodePaths: [path.join(PACKAGE, 'node_modules'), path.join(REPO, 'node_modules')],
		plugins: [
			{
				name: 'transition-benchmark',
				setup(builder) {
					builder.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const entry = exportsMap[request === 'octane' ? '.' : './' + request.slice(7)];
						const target = typeof entry === 'string' ? entry : entry?.import || entry?.default;
						if (typeof target !== 'string') throw new Error(`Unknown Octane import: ${request}`);
						return { path: path.resolve(PACKAGE, target) };
					});
					builder.onLoad({ filter: /runtime\.ts$/ }, ({ path: filename }) => {
						if (filename === path.join(PACKAGE, 'src/runtime.ts')) {
							return {
								contents: version.runtime,
								loader: 'ts',
								resolveDir: path.dirname(filename),
							};
						}
					});
					builder.onLoad({ filter: /\.tsrx$/ }, ({ path: filename }) => {
						const compiled = compile(fs.readFileSync(filename, 'utf8'), filename, {
							mode: 'client',
							hmr: false,
							dev: false,
						});
						if (compiled.diagnostics.length) throw new Error(JSON.stringify(compiled.diagnostics));
						return { contents: compiled.code, loader: 'js', resolveDir: path.dirname(filename) };
					});
				},
			},
		],
	});
	return result.outputFiles[0].text;
}

const targets = [];
let failure;
let browser;
let server;
let chromiumVersion;
try {
	const bundles = new Map();
	for (const version of versions) bundles.set(version.name, await buildBundle(version));
	server = createServer((request, response) => {
		const pathname = new URL(request.url, 'http://localhost').pathname;
		if (pathname === '/favicon.ico') {
			response.writeHead(204);
			response.end();
			return;
		}
		const version = pathname.split('/')[1];
		if (!bundles.has(version)) {
			response.writeHead(404);
			response.end();
			return;
		}
		response.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : 'text/html');
		response.end(
			pathname.endsWith('.js')
				? bundles.get(version)
				: `<div id="main"></div><script type="module" src="/${version}/app.js"></script>`,
		);
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	browser = await chromium.launch({ headless: true });
	chromiumVersion = browser.version();
	const cases = [];
	const errors = [];
	for (const scenario of scenarios) {
		for (const version of versions) {
			const page = await browser.newPage();
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			await page.goto(
				`http://127.0.0.1:${server.address().port}/${version.name}/?scenario=${scenario}`,
			);
			await page.waitForFunction(() => typeof window.transitionBenchmark?.run === 'function');
			await page.evaluate(() => window.transitionBenchmark.verifyPending());
			await page.evaluate((cycles) => window.transitionBenchmark.run(cycles), warmupCycles);
			cases.push({ version, scenario, page, samples: [] });
		}
	}
	if (!workOnly) {
		// Alternate both version and scenario order; paired versions get the same
		// production fixture, compiler, dependencies, warmup, and completed work.
		for (let iteration = 0; iteration < iterations; iteration++) {
			for (const item of iteration % 2 ? [...cases].reverse() : cases) {
				const result = await item.page.evaluate(
					(cycles) => window.transitionBenchmark.run(cycles),
					sampleCycles,
				);
				item.samples.push(result.duration / sampleCycles);
			}
		}
	}
	for (const item of cases) {
		const work = await item.page.evaluate(async (cycles) => {
			const NativeSet = window.Set;
			const nativeGet = Map.prototype.get;
			let sets = 0;
			let mapGets = 0;
			window.Set = class CountingSet extends NativeSet {
				constructor(values) {
					super(values);
					sets++;
				}
			};
			Map.prototype.get = function (key) {
				mapGets++;
				return nativeGet.call(this, key);
			};
			try {
				const result = await window.transitionBenchmark.run(cycles);
				return { sets, mapGets, ...result };
			} finally {
				window.Set = NativeSet;
				Map.prototype.get = nativeGet;
			}
		}, workCycles);
		await item.page.evaluate(() => window.transitionBenchmark.unmount());
		if (errors.length) throw new Error(errors.join('\n'));
		targets.push({
			name: `${item.version.name}:${item.scenario}`,
			ops: {
				...(item.samples.length
					? { cycle: timingStatForJson(summarizeSamples(item.samples)) }
					: {}),
				sets_per_cycle: countStat(work.sets / workCycles),
				map_gets_per_cycle: countStat(work.mapGets / workCycles),
			},
			meta: {
				workCycles,
				sets: work.sets,
				mapGets: work.mapGets,
				runtimeSha256: hash(item.version.runtime),
				bundleBytes: Buffer.byteLength(bundles.get(item.version.name)),
				samples: item.samples,
				semanticControls:
					'value, all pending owners, value commits, host identity, layout cleanup, unmount passed',
			},
		});
		await item.page.close();
	}
	// Budgets are emitted as same-run references for the unified ratio runner.
	// Update them only after measuring and explaining a change in total work.
	targets.push({
		name: 'work-budget',
		ops: { sets_per_cycle: countStat(1), map_gets_per_cycle: countStat(1) },
	});
} catch (error) {
	failure = error?.stack ?? String(error);
} finally {
	await browser?.close();
	if (server?.listening) await new Promise((resolve) => server.close(resolve));
}

const result = {
	suite: 'transition-bookkeeping',
	iterations: workOnly ? 0 : iterations,
	targets,
	meta: {
		node: process.version,
		platform: `${os.platform()} ${os.release()} ${os.arch()}`,
		cpu: os.cpus()[0]?.model,
		chromium: chromiumVersion,
		esbuild: esbuildVersion,
		baselineRevision: baselineRevision ?? null,
		warmupCycles,
		sampleCycles,
		workCycles,
	},
	...(failure ? { failed: failure } : {}),
};
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (failure) process.exitCode = 1;
