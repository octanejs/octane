import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

process.env.NODE_ENV = 'production';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY = path.resolve(HERE, '../..');
const CORE = path.join(REPOSITORY, 'packages/octane');
const requireCore = createRequire(path.join(CORE, 'package.json'));
const esbuild = requireCore('esbuild');
const baseline = process.env.REACT_COMPAT_BASE ?? '874178645e8b3398e8898359f0537f7345b62234';
const iterations = Number(process.env.REACT_COMPAT_SSR_ITERATIONS ?? 20000);
const warmup = Number(process.env.REACT_COMPAT_SSR_WARMUP ?? 10000);
const rounds = Number(process.env.REACT_COMPAT_SSR_ROUNDS ?? 7);
for (const [name, value] of Object.entries({ iterations, warmup, rounds }))
	assert.ok(Number.isSafeInteger(value) && value > 0, `${name}: positive integer`);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-hosted-react-ssr-'));
const git = (...arguments_) =>
	execFileSync('git', arguments_, {
		cwd: REPOSITORY,
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	}).trim();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const previousSources = new Map();
const builtinImports = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const entry = [
	"export { renderToString } from 'octane/server';",
	"export { prerender } from 'octane/static';",
].join('\n');
const expectedHtml = `<main>${Array.from({ length: 20 }, (_, index) => `<p>row ${index}</p>`).join('')}</main>`;
// A compiled static server component returns its already-escaped HTML. Keeping
// that work constant isolates request setup/teardown, rather than compilation.
function Page() {
	return expectedHtml;
}

async function build(name, previous) {
	const loadedSources = new Map();
	const result = await esbuild.build({
		absWorkingDir: REPOSITORY,
		stdin: { contents: entry, resolveDir: CORE, sourcefile: 'native-ssr-entry.ts', loader: 'ts' },
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		minify: true,
		treeShaking: true,
		metafile: true,
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"' },
		plugins: [
			{
				name: 'native-ssr-source-control',
				setup(build) {
					build.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: specifier }) => ({
						path: requireCore.resolve(specifier),
					}));
					build.onLoad({ filter: /\.(?:ts|js)$/ }, ({ path: filename }) => {
						const relative = path.relative(REPOSITORY, filename);
						let contents;
						if (previous && filename.startsWith(path.join(CORE, 'src') + path.sep)) {
							if (!previousSources.has(relative))
								previousSources.set(
									relative,
									execFileSync('git', ['show', `${baseline}:${relative}`], {
										cwd: REPOSITORY,
										encoding: 'utf8',
										maxBuffer: 16 * 1024 * 1024,
									}),
								);
							contents = previousSources.get(relative);
						} else contents = fs.readFileSync(filename, 'utf8');
						loadedSources.set(relative, sha256(contents));
						return { contents, loader: filename.endsWith('.ts') ? 'ts' : 'js' };
					});
				},
			},
		],
	});
	assert.equal(result.outputFiles.length, 1, `${name}: one executable output`);
	const code = result.outputFiles[0].text;
	const output = Object.values(result.metafile.outputs)[0];
	const modules = Object.entries(output.inputs)
		.filter(([, input]) => input.bytesInOutput > 0)
		.map(([module, input]) => ({ module, bytes: input.bytesInOutput }));
	const imports = output.imports.filter((item) => item.external).map((item) => item.path);
	assert.deepEqual(
		modules.filter(({ module }) => /(?:^|\/)node_modules\/(?:react|react-dom)\//.test(module)),
		[],
		`${name}: no retained React or React DOM`,
	);
	assert.deepEqual(
		modules.filter(({ module }) => /packages\/octane\/src\/react\//.test(module)),
		[],
		`${name}: no retained React compatibility implementation`,
	);
	assert.ok(
		imports.every((specifier) => builtinImports.has(specifier)),
		`${name}: only Node built-ins external`,
	);
	const file = path.join(temporary, `${name}.mjs`);
	fs.writeFileSync(file, code);
	const sources = Object.keys(result.metafile.inputs)
		.map((filename) => [
			filename,
			filename === 'packages/octane/native-ssr-entry.ts'
				? sha256(entry)
				: (loadedSources.get(filename) ??
					sha256(fs.readFileSync(path.resolve(REPOSITORY, filename)))),
		])
		.sort(([a], [b]) => a.localeCompare(b));
	return {
		api: await import(pathToFileURL(file).href),
		evidence: {
			name,
			raw: Buffer.byteLength(code),
			gzip: gzipSync(code).length,
			brotli: brotliCompressSync(code, {
				params: { [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY },
			}).length,
			sha256: sha256(code),
			sourceSha256: sha256(JSON.stringify(sources)),
			sources,
			modules,
			imports,
		},
	};
}

function checkResult(result) {
	assert.equal(result.html, expectedHtml);
	assert.equal(result.css, '');
}

async function measure(api, operation, count) {
	let last;
	const start = performance.now();
	if (operation === 'renderToString') {
		for (let index = 0; index < count; index++) last = api.renderToString(Page);
	} else {
		for (let index = 0; index < count; index++) last = await api.prerender(Page);
	}
	const elapsedMs = performance.now() - start;
	checkResult(last);
	return { elapsedMs, microsecondsPerRender: (elapsedMs * 1000) / count };
}

const report = {
	suite: 'octane-hosted-react-native-ssr',
	createdAt: new Date().toISOString(),
	command: 'node benchmarks/octane-hosted-react/ssr-run.mjs',
	baseline: git('rev-parse', baseline),
	candidateHead: git('rev-parse', 'HEAD'),
	dirty: git('status', '--short'),
	parameters: { iterations, warmup, rounds, rows: 20, unit: 'microseconds per render' },
	build: {
		entry,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		minify: true,
		treeShaking: true,
		define: { 'process.env.NODE_ENV': '"production"' },
		gzipLevel: 'zlib default',
		brotliQuality: zlib.BROTLI_MAX_QUALITY,
		runnerSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
	},
	environment: {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		cpus: os.cpus()[0]?.model,
		logicalCpus: os.cpus().length,
		esbuild: esbuild.version,
		loadAverageAtStart: os.loadavg(),
		machineIsolation: 'none; shared local machine',
	},
	semantic: { htmlSha256: sha256(expectedHtml), htmlBytes: Buffer.byteLength(expectedHtml) },
	bundles: {},
	operations: {},
};

try {
	const currentManifest = JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf8'));
	const previousManifest = JSON.parse(git('show', `${baseline}:packages/octane/package.json`));
	assert.deepEqual(
		currentManifest.sideEffects,
		previousManifest.sideEffects,
		'same side-effect metadata',
	);
	for (const specifier of ['./server', './static'])
		assert.deepEqual(
			currentManifest.exports[specifier],
			previousManifest.exports[specifier],
			`same ${specifier} export`,
		);
	const variants = {
		baseline: await build('baseline', true),
		candidate: await build('candidate', false),
	};
	for (const [name, variant] of Object.entries(variants)) {
		checkResult(variant.api.renderToString(Page));
		checkResult(await variant.api.prerender(Page));
		report.bundles[name] = variant.evidence;
	}
	report.bundleDelta = Object.fromEntries(
		['raw', 'gzip', 'brotli'].map((kind) => [
			kind,
			report.bundles.candidate[kind] - report.bundles.baseline[kind],
		]),
	);
	for (const operation of ['renderToString', 'prerender']) {
		for (const variant of Object.values(variants)) await measure(variant.api, operation, warmup);
		const samples = { baseline: [], candidate: [] };
		const order = [];
		for (let round = 0; round < rounds; round++) {
			const lanes = round % 2 === 0 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
			order.push(lanes);
			for (const name of lanes)
				samples[name].push(await measure(variants[name].api, operation, iterations));
		}
		const stats = Object.fromEntries(
			Object.entries(samples).map(([name, values]) => [
				name,
				timingStatForJson(
					summarizeSamples(
						values.map((sample) => sample.microsecondsPerRender),
						{ scoreMode: 'mean' },
					),
					{ p99: true },
				),
			]),
		);
		report.operations[operation] = {
			stats,
			candidateOverBaselineMean: stats.candidate.mean / stats.baseline.mean,
			candidateOverBaselineMedian: stats.candidate.median / stats.baseline.median,
			order,
			rawSamples: samples,
		};
	}
	report.semantic.correctness =
		'pass: identical 20-row HTML and empty CSS before timings and after every batch';
	console.log(
		`PASS native SSR bundles: ${report.bundles.baseline.raw}/${report.bundles.baseline.gzip} -> ${report.bundles.candidate.raw}/${report.bundles.candidate.gzip} raw/gzip bytes; no React or bridge modules`,
	);
	console.table(
		Object.entries(report.operations).flatMap(([operation, { stats }]) =>
			Object.entries(stats).map(([lane, values]) => ({
				operation,
				lane,
				mean_us: values.mean,
				median_us: values.median,
				rme_pct: values.rme,
			})),
		),
	);
} catch (error) {
	report.failed = error?.stack ?? String(error);
	console.error(report.failed);
	process.exitCode = 1;
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(report, null, '\t')}\n`);
}
