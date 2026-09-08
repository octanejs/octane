import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

process.env.NODE_ENV = 'production';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY = path.resolve(HERE, '../..');
const CORE = path.join(REPOSITORY, 'packages/octane');
const requireCore = createRequire(path.join(CORE, 'package.json'));
const esbuild = requireCore('esbuild');
const { chromium } = requireCore('playwright');
const { createOctaneCompiler } = await import(
	pathToFileURL(requireCore.resolve('octane/compiler/bundler')).href
);
const compiler = createOctaneCompiler({ root: HERE });
const args = process.argv.slice(2);
const iterations = Number(args.find((value) => /^\d+$/.test(value)) ?? 30);
const warmup = 5;
const counts = (process.env.REACT_COMPAT_COUNTS ?? '1,100').split(',').map(Number);
const baseline = process.env.REACT_COMPAT_BASE ?? '874178645e8b3398e8898359f0537f7345b62234';
const bundleOnly = args.includes('--bundle-only');
assert.ok(Number.isSafeInteger(iterations) && iterations > 0, 'positive integer sample count');
assert.ok(
	counts.every((count) => Number.isSafeInteger(count) && count > 0),
	'positive integer island counts',
);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-hosted-react-'));
const files = new Map();
const targets = [];
const git = (...arguments_) =>
	execFileSync('git', arguments_, { cwd: REPOSITORY, encoding: 'utf8' }).trim();
const baselineSource = new Map();
let browser;
let server;
let failure;
let environment;
let evidence;

function bytes(code) {
	const buffer = Buffer.from(code);
	return {
		raw: buffer.length,
		gzip: gzipSync(buffer, { level: zlib.Z_BEST_COMPRESSION }).length,
		brotli: brotliCompressSync(buffer, {
			params: { [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY },
		}).length,
	};
}

async function build(name, entry, { previous = false, external = [], measuredControl } = {}) {
	const loadedSource = new Map();
	const result = await esbuild.build({
		absWorkingDir: REPOSITORY,
		entryPoints: [path.join(HERE, 'src', entry)],
		outfile: path.join(temporary, `${name}.mjs`),
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'esnext',
		minify: true,
		treeShaking: true,
		metafile: true,
		logLevel: 'silent',
		nodePaths: [path.join(CORE, 'node_modules')],
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'public-source-controls',
				setup(build) {
					build.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: specifier }) => ({
						path: requireCore.resolve(specifier),
					}));
					build.onResolve({ filter: /^react(?:-dom)?(?:\/|$)/ }, ({ path: specifier }) => {
						// Exact matches only: externalizing react-dom must not accidentally
						// externalize react-dom/client and hide the inverse bridge cost.
						return external.includes(specifier) ? { path: specifier, external: true } : null;
					});
					if (measuredControl)
						build.onResolve({ filter: /^\.\/octane-compat-control\.js$/ }, () => ({
							path: measuredControl,
						}));
					build.onLoad({ filter: /\.(?:tsrx|ts|js)$/ }, ({ path: filename }) => {
						let source;
						if (previous && filename.startsWith(path.join(CORE, 'src') + path.sep)) {
							const relative = path.relative(REPOSITORY, filename);
							if (!baselineSource.has(relative))
								baselineSource.set(
									relative,
									execFileSync('git', ['show', `${baseline}:${relative}`], {
										cwd: REPOSITORY,
										encoding: 'utf8',
										maxBuffer: 16 * 1024 * 1024,
									}),
								);
							source = baselineSource.get(relative);
						} else source = fs.readFileSync(filename, 'utf8');
						loadedSource.set(
							path.relative(REPOSITORY, filename),
							createHash('sha256').update(source).digest('hex'),
						);
						if (filename.endsWith('.tsrx')) {
							const compiled = compiler.transform(source, filename, {
								environment: 'client',
								hmr: false,
								dev: false,
								profile: false,
							});
							assert.equal(compiled?.kind, 'compile', `${name}: fixture must be compiled`);
							return { contents: compiled.code, loader: 'js' };
						}
						return { contents: source, loader: filename.endsWith('.ts') ? 'ts' : 'js' };
					});
				},
			},
		],
	});
	assert.equal(result.outputFiles.length, 1, `${name}: single output`);
	const code = result.outputFiles[0].text;
	const output = Object.values(result.metafile.outputs)[0];
	const modules = Object.entries(output.inputs)
		.filter(([, item]) => item.bytesInOutput > 0)
		.map(([module, item]) => ({ module, bytes: item.bytesInOutput }));
	const imports = output.imports.filter((item) => item.external).map((item) => item.path);
	fs.writeFileSync(path.join(temporary, `${name}.mjs`), code);
	files.set(`/${name}.mjs`, code);
	return {
		name,
		...bytes(code),
		sha256: createHash('sha256').update(code).digest('hex'),
		modules,
		imports,
		sourceSha256: createHash('sha256')
			.update(JSON.stringify([...loadedSource].sort()))
			.digest('hex'),
	};
}

function noModules(bundle, pattern, explanation) {
	assert.deepEqual(
		bundle.modules.filter(({ module }) => pattern.test(module)),
		[],
		explanation,
	);
}

async function evaluate(module, method, arguments_ = []) {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	try {
		await page.goto(environment.origin);
		const result = await page.evaluate(
			async ({ module, method, arguments_ }) => {
				const api = await import(`/${module}.mjs`);
				return api[method](...arguments_);
			},
			{ module, method, arguments_ },
		);
		assert.deepEqual(errors, [], `${module}: browser errors`);
		return result;
	} finally {
		await page.close();
	}
}

try {
	// Both runtime snapshots use the same fixture, dependencies, public export
	// resolution, package side-effect metadata, defines, bundler and options.
	const currentManifest = JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf8'));
	const previousManifest = JSON.parse(git('show', `${baseline}:packages/octane/package.json`));
	assert.deepEqual(
		currentManifest.sideEffects,
		previousManifest.sideEffects,
		'baseline/candidate side-effect metadata',
	);
	assert.deepEqual(
		currentManifest.exports['.'],
		previousManifest.exports['.'],
		'baseline/candidate native public export',
	);
	const nativeBefore = await build('native-before', 'native-control.ts', { previous: true });
	const nativeAfter = await build('native-after', 'native-control.ts');
	for (const native of [nativeBefore, nativeAfter]) {
		noModules(
			native,
			/(?:^|\/)node_modules\/(?:react|react-dom)\//,
			`${native.name}: no React dependency`,
		);
		noModules(
			native,
			/packages\/octane\/src\/react\//,
			`${native.name}: no React compatibility dependency`,
		);
		assert.deepEqual(native.imports, [], `${native.name}: no externalized dependencies`);
	}
	const reverse = await build('octane-compat-only', 'octane-compat-control.ts', {
		external: ['react', 'react-dom'],
	});
	noModules(
		reverse,
		/(?:^|\/)node_modules\/react-dom\/(?:client|cjs\/react-dom-client)/,
		'OctaneCompat-only must not retain ReactDOM client',
	);
	noModules(
		reverse,
		/packages\/octane\/src\/react\/react-compat(?:-|\.)/,
		'OctaneCompat-only must not retain the inverse bridge',
	);
	assert.ok(
		!reverse.imports.includes('react-dom/client'),
		'ReactDOM client must not be hidden in external imports',
	);
	assert.ok(
		reverse.modules.some(({ module }) => /packages\/octane\/src\/react\/index\.ts$/.test(module)),
		'OctaneCompat remains live',
	);
	await build('octane-compat-verify', 'octane-compat-verify.ts', {
		measuredControl: path.join(temporary, 'octane-compat-only.mjs'),
	});
	let workload;
	if (!bundleOnly) workload = await build('browser', 'browser.ts');
	evidence = {
		baseline,
		candidateHead: git('rev-parse', 'HEAD'),
		dirty: git('status', '--short'),
		nativeBefore,
		nativeAfter,
		nativeDelta: Object.fromEntries(
			['raw', 'gzip', 'brotli'].map((kind) => [kind, nativeAfter[kind] - nativeBefore[kind]]),
		),
		octaneCompatOnly: reverse,
		workload,
	};
	server = http.createServer((request, response) => {
		const code = files.get(request.url);
		response.writeHead(code === undefined && request.url !== '/' ? 404 : 200, {
			'Content-Type': code === undefined ? 'text/html' : 'text/javascript',
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
		});
		response.end(code ?? '<!doctype html><html><body></body></html>');
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	browser = await chromium.launch({ headless: true });
	environment = {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		cpus: os.cpus()[0]?.model,
		chromium: browser.version(),
		esbuild: esbuild.version,
		react: requireCore('react/package.json').version,
		reactDOM: requireCore('react-dom/package.json').version,
		origin: `http://127.0.0.1:${server.address().port}/`,
	};
	evidence.nativeBefore.semantic = await evaluate('native-before', 'runNativeControl');
	evidence.nativeAfter.semantic = await evaluate('native-after', 'runNativeControl');
	assert.deepEqual(
		evidence.nativeBefore.semantic,
		evidence.nativeAfter.semantic,
		'native semantics match',
	);
	evidence.octaneCompatOnly.semantic = await evaluate(
		'octane-compat-verify',
		'verifyOctaneCompatControl',
	);
	console.log(
		`PASS native control bytes (raw/gzip/brotli): ${nativeBefore.raw}/${nativeBefore.gzip}/${nativeBefore.brotli} -> ${nativeAfter.raw}/${nativeAfter.gzip}/${nativeAfter.brotli}`,
	);
	console.log(
		`PASS OctaneCompat-only: ${reverse.raw}/${reverse.gzip}/${reverse.brotli} bytes; inverse ReactDOM client absent`,
	);
	if (!bundleOnly) {
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await page.goto(environment.origin);
		environment.crossOriginIsolated = await page.evaluate(() => crossOriginIsolated);
		assert.equal(
			environment.crossOriginIsolated,
			true,
			'isolate origins for high-resolution timings',
		);
		try {
			for (const count of counts) {
				const lanes = ['direct-react-roots', 'react-compat'];
				const samples = Object.fromEntries(lanes.map((lane) => [lane, []]));
				for (let iteration = 0; iteration < warmup + iterations; iteration++) {
					const paired = {};
					for (const lane of iteration % 2 === 0 ? lanes : [...lanes].reverse()) {
						const result = await page.evaluate(
							async ({ lane, count }) => {
								const { sample } = await import('/browser.mjs');
								return sample(lane, count);
							},
							{ lane, count },
						);
						paired[lane] = result;
						if (iteration >= warmup) samples[lane].push(result.timings);
					}
					assert.deepEqual(
						paired[lanes[0]].semantic,
						paired[lanes[1]].semantic,
						`same output and effect/ref/state semantics at ${count}`,
					);
					assert.deepEqual(errors, [], `workload browser errors at ${count}`);
				}
				for (const lane of lanes) {
					const ops = Object.fromEntries(
						Object.keys(samples[lane][0]).map((operation) => [
							operation,
							timingStatForJson(
								summarizeSamples(
									samples[lane].map((sample) => sample[operation]),
									{ scoreMode: 'mean' },
								),
								{ p99: true },
							),
						]),
					);
					targets.push({
						name: `${lane}-${count}`,
						ops,
						meta: { count, warmup, rawSamples: samples[lane], correctness: 'pass' },
					});
				}
				console.log(
					`PASS paired workload: ${count} islands, ${warmup} warmups + ${iterations} samples per lane`,
				);
			}
		} finally {
			await page.close();
		}
	}
} catch (error) {
	failure = error?.stack ?? String(error);
	console.error(failure);
	process.exitCode = 1;
} finally {
	await browser?.close();
	if (server)
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	fs.rmSync(temporary, { recursive: true, force: true });
	if (environment) delete environment.origin;
	const payload = {
		suite: 'octane-hosted-react',
		iterations,
		environment,
		evidence,
		targets,
		...(failure ? { failed: failure } : {}),
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
	if (targets.length)
		console.table(
			targets.flatMap(({ name, ops }) =>
				Object.entries(ops).map(([operation, value]) => ({
					name,
					operation,
					mean_ms: Number(value.mean.toFixed(3)),
					median_ms: Number(value.median.toFixed(3)),
					rme_pct: Number(value.rme.toFixed(1)),
				})),
			),
		);
}
