// Production compiler/runtime comparison with public output controls. happy-dom
// measures synchronous renderer work only: no browser layout, paint, or frames.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, brotliCompressSync, constants as zlib } from 'node:zlib';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { runNativeCollectorControls } from './native-collector-controls.mjs';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../..');
const options = new Map();
const allowed = new Set([
	'baseline-root',
	'baseline-ref',
	'tooling-root',
	'samples',
	'updates',
	'mounts',
	'ssr',
	'collector',
]);
let quick = false;
for (const arg of process.argv.slice(2)) {
	if (arg === '--quick') {
		quick = true;
		continue;
	}
	const match = /^--([^=]+)=(.+)$/.exec(arg);
	assert.ok(match && allowed.has(match[1]) && !options.has(match[1]), `Invalid option: ${arg}`);
	options.set(match[1], match[2]);
}
function integer(name, fallback) {
	const value = options.get(name) ?? String(fallback);
	assert.match(value, /^[1-9]\d*$/, name);
	assert.ok(Number.isSafeInteger(Number(value)), name);
	return Number(value);
}
const samples = integer('samples', quick ? 3 : 9);
const updates = integer('updates', quick ? 200 : 2000);
const mounts = integer('mounts', quick ? 8 : 64);
const ssrRenders = integer('ssr', quick ? 100 : 1000);
const collectorCycles = integer('collector', quick ? 2000 : 100000);
const warmups = 2;
const hash = (data) => createHash('sha256').update(data).digest('hex');
const hashFile = (file) => hash(fs.readFileSync(file));
const git = (...args) =>
	execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-native-costs-'));
const fixtureFile = path.join(HERE, 'native-costs.tsrx');
const fixture = fs.readFileSync(fixtureFile, 'utf8');
const roots = [{ label: 'current', root: REPO }];
if (options.has('baseline-root')) {
	assert.ok(options.has('baseline-ref'), '--baseline-root requires an immutable --baseline-ref');
	roots.unshift({
		label: 'baseline',
		root: fs.realpathSync(path.resolve(options.get('baseline-root'))),
	});
}
const toolingRoot = fs.realpathSync(
	path.resolve(options.get('tooling-root') ?? path.join(REPO, 'packages/octane')),
);
const requireTool = createRequire(path.join(toolingRoot, 'package.json'));
const { build, transformSync, version: esbuildVersion } = requireTool('esbuild');
const { Window } = await import(pathToFileURL(requireTool.resolve('happy-dom')).href);
const snapshotInputs = new Map();

function readInput(file) {
	const real = fs.realpathSync(file);
	if (!snapshotInputs.has(real)) snapshotInputs.set(real, fs.readFileSync(real));
	return snapshotInputs.get(real);
}

function packageEvidence(specifier, expectedName) {
	const entry = fs.realpathSync(requireTool.resolve(specifier));
	let directory = path.dirname(entry);
	for (;;) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest)) {
			const source = readInput(manifest);
			const data = JSON.parse(source);
			if (data.name === expectedName)
				return {
					name: data.name,
					version: data.version,
					entry,
					entrySha256: hash(readInput(entry)),
					root: directory,
					manifestSha256: hash(source),
				};
		}
		const parent = path.dirname(directory);
		assert.notEqual(parent, directory, 'Missing dependency manifest: ' + expectedName);
		directory = parent;
	}
}

const dependencies = {
	esbuild: packageEvidence('esbuild', 'esbuild'),
	core: packageEvidence('@tsrx/core', '@tsrx/core'),
	dom: packageEvidence('happy-dom', 'happy-dom'),
	alien: packageEvidence('alien-signals', 'alien-signals'),
	devalue: packageEvidence('devalue', 'devalue'),
};
assert.equal(dependencies.alien.version, '3.2.0');
assert.equal(dependencies.esbuild.version, esbuildVersion);
const CASES = [
	{ name: 'unread-block', component: 'UnreadBlock', reads: 0 },
	{ name: 'unread-return', component: 'UnreadReturn', reads: 0 },
	{ name: 'single-block', component: 'ReadBlock', reads: 1 },
	{ name: 'single-return', component: 'ReadReturn', reads: 1 },
	{ name: 'repeated-block', component: 'RepeatedReadBlock', reads: 16, repeated: true },
	{ name: 'distinct-block', component: 'DistinctReadBlock', reads: 16, distinct: true },
];
const compiled = [];
const timings = [];
const deterministic = [];
const payload = {
	suite: 'scoped-native-reads',
	iterations: samples,
	startedAt: new Date().toISOString(),
	request: process.argv,
	limits: [
		'Synchronous production source renderer work in happy-dom; no layout, paint, browser frame, or hydration timing.',
		'Compile and bundle times, source hashing, semantic checks, and teardown verification are outside measured render intervals.',
		'Native source dependencies may come from an explicitly supplied supplemental source toolchain; this is not a locked workspace or CI gate.',
		'Five-dependency use() calls are deterministic source-factory work, not V8 allocation counts.',
		'An overlapping timing uncertainty interval is inconclusive; no wall-clock pass threshold is introduced.',
	],
	environment: {
		node: process.version,
		execArgv: process.execArgv,
		platform: process.platform,
		arch: process.arch,
		cpu: os.cpus()[0]?.model,
		currentRef: git('rev-parse', 'HEAD').trim(),
		currentDirty: git('status', '--porcelain').trim() !== '',
		baselineRef: options.has('baseline-ref')
			? git('rev-parse', '--verify', options.get('baseline-ref') + '^{commit}').trim()
			: null,
		baselineArchive:
			options.has('baseline-root') &&
			fs.existsSync(path.join(options.get('baseline-root'), 'source.tar'))
				? {
						path: path.resolve(options.get('baseline-root'), 'source.tar'),
						sha256: hashFile(path.join(options.get('baseline-root'), 'source.tar')),
					}
				: null,
		baselineLockfileSha256: options.has('baseline-ref')
			? hash(git('show', options.get('baseline-ref') + ':pnpm-lock.yaml'))
			: null,
		toolingRoot,
		dependencies,
		fixtureSha256: hash(fixture),
		factorySha256: hashFile(path.join(HERE, 'native-cost-factory.mjs')),
		runnerSha256: hashFile(import.meta.filename),
		lockfileSha256: hashFile(path.join(REPO, 'pnpm-lock.yaml')),
	},
	configuration: {
		samples,
		updates,
		mounts,
		ssrRenders,
		collectorCycles,
		warmups,
		fiveDependencyRepeats: 32,
	},
	compiled,
	timings,
	deterministic,
};

function setupDom() {
	const window = new Window({ url: 'http://localhost/' });
	for (const key of [
		'window',
		'document',
		'navigator',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'Text',
		'Comment',
		'DocumentFragment',
		'Event',
		'EventTarget',
		'MutationObserver',
		'HTMLInputElement',
		'HTMLSelectElement',
		'HTMLTextAreaElement',
		'getComputedStyle',
		'requestAnimationFrame',
		'cancelAnimationFrame',
	]) {
		const value = key === 'window' ? window : window[key];
		if (value !== undefined)
			Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
	}
	return window;
}

function compilerSnapshot(root) {
	const directory = path.join(root, 'packages/octane/src/compiler');
	const files = fs
		.readdirSync(directory, { recursive: true })
		.filter((name) => /\.[cm]?js$/.test(name));
	return files.sort().map((name) => {
		const file = path.join(directory, name);
		const source = readInput(file);
		return { path: path.relative(root, file), sha256: hash(source) };
	});
}

async function buildCase(target, scenario, nativeReads, mode) {
	const packageRoot = path.join(target.root, 'packages/octane');
	const manifest = JSON.parse(readInput(path.join(packageRoot, 'package.json')));
	const { compile } = await import(
		pathToFileURL(path.join(packageRoot, 'src/compiler/compile.js')).href
	);
	const compilerOptions = { mode, dev: false, hmr: false, nativeReads };
	const result = compile(fixture, fixtureFile, compilerOptions);
	assert.deepEqual(result.diagnostics, [], 'Benchmark fixture must compile without diagnostics');
	const name = [target.label, nativeReads ? 'native' : 'ordinary', scenario.name, mode].join(':');
	const entry = [
		`export { ${scenario.component} as Component } from ${JSON.stringify(fixtureFile)};`,
		mode === 'client'
			? 'export { createRoot, flushSync } from "octane";'
			: 'export { renderToString } from "octane/server";',
		scenario.reads ? 'export { createScope } from "octane/signals";' : '',
		scenario.name === 'five-dependencies'
			? `export { factoryCalls, resetFactoryCalls } from ${JSON.stringify(path.join(HERE, 'native-cost-factory.mjs'))};`
			: '',
	].join('\n');
	const output = await build({
		absWorkingDir: REPO,
		stdin: { contents: entry, sourcefile: name + '.mjs', resolveDir: HERE },
		bundle: true,
		write: false,
		metafile: true,
		minify: true,
		treeShaking: true,
		platform: 'node',
		format: 'esm',
		target: 'es2022',
		legalComments: 'none',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		logLevel: 'silent',
		plugins: [
			{
				name: 'native-costs-public-source',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const key = request === 'octane' ? '.' : './' + request.slice(7);
						const value = manifest.exports[key];
						const destination = typeof value === 'string' ? value : value?.default;
						assert.equal(typeof destination, 'string', 'Public source export: ' + request);
						return { path: path.resolve(packageRoot, destination) };
					});
					plugin.onResolve({ filter: /^(?:alien-signals|devalue)(?:\/|$)/ }, (request) => {
						if (request.pluginData?.nativeCostsDependency) return null;
						return plugin.resolve(request.path, {
							kind: request.kind,
							resolveDir: toolingRoot,
							pluginData: { nativeCostsDependency: true },
						});
					});
					plugin.onLoad({ filter: /\.tsrx$/ }, ({ path: file }) => {
						assert.equal(file, fixtureFile);
						return { contents: result.code, loader: 'js', resolveDir: HERE };
					});
					plugin.onLoad({ filter: /\.(?:[cm]?[jt]s|json)$/ }, ({ path: file }) => {
						const source = readInput(file);
						const extension = path.extname(file);
						return {
							contents: source,
							loader: extension === '.ts' ? 'ts' : extension === '.json' ? 'json' : 'js',
							resolveDir: path.dirname(file),
						};
					});
				},
			},
		],
	});
	const code = output.outputFiles[0].text;
	const file = path.join(scratch, name.replaceAll(':', '-') + '.mjs');
	fs.writeFileSync(file, code);
	const inputs = Object.keys(output.metafile.inputs)
		.filter((input) => !input.endsWith(name + '.mjs'))
		.map((input) => {
			if (path.resolve(REPO, input) === fixtureFile)
				return { path: input, sha256: hash(result.code), compiledFixture: true };
			const absolute = fs.realpathSync(path.resolve(REPO, input));
			const source = readInput(absolute);
			return { path: input, absolutePath: absolute, sha256: hash(source) };
		});
	for (const input of inputs) {
		if (input.compiledFixture) continue;
		for (const dependency of [dependencies.alien, dependencies.devalue]) {
			if (!input.path.includes('/node_modules/' + dependency.name + '/')) continue;
			assert.ok(
				input.absolutePath.startsWith(dependency.root + path.sep),
				'Bundled dependency differs from selected installation: ' + dependency.name,
			);
		}
	}
	if (!scenario.reads) {
		assert.ok(
			inputs.every(
				(input) => !/alien-signals|\/signals\/(?:engine|graph|requests)\.ts/.test(input.path),
			),
			'Unread control imported a signal engine',
		);
	}
	const codeMinified = transformSync(result.code, { minify: true }).code;
	compiled.push({
		name,
		compilerOptions,
		entrySha256: hash(entry),
		codeSha256: hash(result.code),
		codeBytes: Buffer.byteLength(result.code),
		codeMinifiedBytes: Buffer.byteLength(codeMinified),
		bundleSha256: hash(code),
		bundleBytes: Buffer.byteLength(code),
		gzipBytes: gzipSync(code, { level: zlib.Z_BEST_COMPRESSION }).length,
		brotliBytes: brotliCompressSync(code, {
			params: { [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY },
		}).length,
		inputs,
	});
	return {
		name,
		target: target.label,
		nativeReads,
		mode,
		scenario,
		api: await import(pathToFileURL(file).href),
	};
}

async function buildCollector(target) {
	const name = target.label + ':collector';
	const entry = [
		`export { createNativeReadCollector, validateNativeReadWitness } from ${JSON.stringify(path.join(target.root, 'packages/octane/src/signals/native-read-collector.ts'))};`,
		`export { reportNativeRead, getNativeReadObserver, isNativeWriteGuarded } from ${JSON.stringify(path.join(target.root, 'packages/octane/src/signals/read-protocol.ts'))};`,
	].join('\n');
	const output = await build({
		absWorkingDir: REPO,
		stdin: { contents: entry, sourcefile: name + '.mjs', resolveDir: HERE },
		bundle: true,
		write: false,
		metafile: true,
		minify: true,
		treeShaking: true,
		platform: 'node',
		format: 'esm',
		target: 'es2022',
		legalComments: 'none',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"' },
		logLevel: 'silent',
		plugins: [
			{
				name: 'native-collector-source-inputs',
				setup(plugin) {
					plugin.onLoad({ filter: /\.ts$/ }, ({ path: file }) => ({
						contents: readInput(file),
						loader: 'ts',
						resolveDir: path.dirname(file),
					}));
				},
			},
		],
	});
	const code = output.outputFiles[0].text;
	const file = path.join(scratch, target.label + '-collector.mjs');
	fs.writeFileSync(file, code);
	compiled.push({
		name,
		entrySha256: hash(entry),
		bundleSha256: hash(code),
		bundleBytes: Buffer.byteLength(code),
		method:
			'Direct collector protocol microbenchmark; supplementary to public compiled renderer controls.',
		inputs: Object.keys(output.metafile.inputs)
			.filter((input) => !input.endsWith(name + '.mjs'))
			.map((input) => ({ path: input, sha256: hash(readInput(path.resolve(REPO, input))) })),
	});
	const api = await import(pathToFileURL(file).href);
	return ['empty', 'repeated', 'distinct', 'nested-witness', 'replay'].map((scenario) => ({
		name: name + ':' + scenario,
		target: target.label,
		nativeReads: true,
		mode: 'collector',
		scenario: { name: scenario },
		api,
	}));
}

function dataFor(entry) {
	if (!entry.scenario.reads)
		return {
			props: { tick: 0, value: 7 },
			value: () => '7',
			update: null,
			dispose() {},
		};
	const scope = entry.api.createScope({ scopeKey: 'native-cost-' + entry.name });
	const sources$ = Array.from({ length: 16 }, (_, index) => scope.signal$('source-' + index, 7));
	let current = 7;
	return {
		props: { tick: 0, source$: sources$[0], sources$ },
		value: () => String(current * entry.scenario.reads),
		update(value) {
			current = value;
			scope.batch(() => {
				for (const source$ of entry.scenario.distinct ? sources$ : [sources$[0]])
					source$.set(value);
			});
		},
		dispose() {
			scope.dispose();
		},
	};
}

function checkElement(container, expected, tick, host) {
	const output = container.querySelector('output');
	assert.ok(output, 'Output must remain mounted');
	assert.equal(output.textContent, expected);
	assert.equal(output.getAttribute('data-tick'), String(tick));
	if (host)
		assert.equal(output, host, 'Ordinary prop and native value updates preserve host identity');
	return output;
}

function measureClient(entry) {
	const { api } = entry;
	const data = dataFor(entry);
	const mounted = Array.from({ length: mounts }, () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		return { container, root: api.createRoot(container) };
	});
	let start = performance.now();
	for (const { root } of mounted) root.render(api.Component, data.props);
	const mountUs = ((performance.now() - start) * 1000) / mounts;
	for (const { container } of mounted) checkElement(container, data.value(), 0);
	start = performance.now();
	for (const { root } of mounted) root.unmount();
	const unmountUs = ((performance.now() - start) * 1000) / mounts;
	for (const { container } of mounted) {
		assert.equal(container.textContent, '');
		container.remove();
	}
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = api.createRoot(container);
	root.render(api.Component, data.props);
	const host = checkElement(container, data.value(), 0);
	const props = Array.from({ length: updates }, (_, tick) => ({ ...data.props, tick: tick + 1 }));
	start = performance.now();
	for (const value of props) api.flushSync(() => root.render(api.Component, value));
	const propUpdateUs = ((performance.now() - start) * 1000) / updates;
	checkElement(container, data.value(), updates, host);
	let signalUpdateUs;
	if (data.update !== null) {
		start = performance.now();
		for (let index = 0; index < updates; index++) api.flushSync(() => data.update(8 + index));
		signalUpdateUs = ((performance.now() - start) * 1000) / updates;
		checkElement(container, data.value(), updates, host);
	}
	root.unmount();
	assert.equal(container.textContent, '');
	data.update?.(updates + 9);
	assert.equal(container.textContent, '', 'A live producer must not revive a retired renderer');
	container.remove();
	data.dispose();
	return {
		mount_us: mountUs,
		prop_update_us: propUpdateUs,
		unmount_us: unmountUs,
		...(signalUpdateUs === undefined ? {} : { signal_update_us: signalUpdateUs }),
	};
}

function serverText(result) {
	assert.equal(typeof result.html, 'string');
	const match = /<output(?:\s[^>]*)?>([\s\S]*?)<\/output>/.exec(result.html);
	assert.ok(match, 'SSR must contain the output element');
	return match[1].replace(/<!--[\s\S]*?-->/g, '');
}

function measureServer(entry) {
	const data = dataFor(entry);
	assert.equal(serverText(entry.api.renderToString(entry.api.Component, data.props)), data.value());
	const props = Array.from({ length: ssrRenders }, (_, tick) => ({ ...data.props, tick }));
	let last;
	const start = performance.now();
	for (const value of props) last = entry.api.renderToString(entry.api.Component, value);
	const renderUs = ((performance.now() - start) * 1000) / ssrRenders;
	assert.equal(serverText(last), data.value());
	if (data.update !== null) {
		data.update(11);
		assert.equal(
			serverText(entry.api.renderToString(entry.api.Component, data.props)),
			data.value(),
		);
	}
	data.dispose();
	return { render_us: renderUs };
}

function measureCollector(entry) {
	const { api } = entry;
	let calls = 0;
	const owner = {};
	const collector = api.createNativeReadCollector((observed) => {
		if (observed !== owner) throw new Error('Collector changed the read owner');
		calls++;
	});
	const sources = Array.from({ length: 16 }, () => ({
		version: 1,
		getVersion() {
			return this.version;
		},
		subscribe() {
			return () => {};
		},
	}));
	let lastWitness;
	let replayWitness;
	if (entry.scenario.name === 'replay') {
		const frame = collector.beginScope(owner);
		const witness = collector.beginWitness();
		for (const source of sources) api.reportNativeRead(source, 1);
		replayWitness = collector.finishWitness(witness, true);
		collector.endScope(frame);
		calls = 0;
	}
	const start = performance.now();
	for (let cycle = 0; cycle < collectorCycles; cycle++) {
		// The current driver collects parameters before this compiled body;
		// the baseline ignores the optional owner argument until beginScope.
		// Reads occur inside both scopes so their semantic work is identical.
		const render = collector.beginRender(owner);
		const scope = collector.beginScope(owner);
		switch (entry.scenario.name) {
			case 'empty':
				break;
			case 'repeated':
				for (let index = 0; index < 16; index++) api.reportNativeRead(sources[0], 1);
				break;
			case 'distinct':
				for (const source of sources) api.reportNativeRead(source, 1);
				break;
			case 'nested-witness': {
				const a = collector.beginWitness();
				const b = collector.beginWitness();
				const c = collector.beginWitness();
				const d = collector.beginWitness();
				for (const source of sources) api.reportNativeRead(source, 1);
				collector.finishWitness(d, true);
				collector.finishWitness(c, true);
				collector.finishWitness(b, true);
				lastWitness = collector.finishWitness(a, true);
				break;
			}
			case 'replay':
				collector.replay(replayWitness);
				break;
			default:
				throw new Error('Unknown collector scenario');
		}
		collector.endScope(scope);
		collector.endRender(render);
	}
	const elapsed = performance.now() - start;
	assert.equal(calls, entry.scenario.name === 'empty' ? 0 : collectorCycles * 16);
	assert.equal(api.getNativeReadObserver(), null, 'Collector must restore the prior observer');
	assert.equal(api.isNativeWriteGuarded(), false, 'Collector must restore the prior write guard');
	const witness = lastWitness ?? replayWitness;
	if (witness) {
		assert.equal(witness.reads.size, 16);
		assert.ok(api.validateNativeReadWitness(witness));
		sources[0].version++;
		assert.equal(
			api.validateNativeReadWitness(witness),
			false,
			'Changed source invalidates a captured witness',
		);
	}
	return { collection_us: (elapsed * 1000) / collectorCycles };
}

function fiveDependencies(entry) {
	const { api } = entry;
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = api.createRoot(container);
	let props = { a: 1, b: 2, c: 3, d: 4, e: 5, tick: 0 };
	const render = () => {
		api.flushSync(() => root.render(api.Component, props));
		checkElement(container, [props.a, props.b, props.c, props.d, props.e].join(':'), props.tick);
	};
	api.resetFactoryCalls();
	render();
	const mountedCalls = api.factoryCalls();
	api.resetFactoryCalls();
	for (let index = 0; index < 32; index++) {
		props = { ...props, tick: index + 1 };
		render();
	}
	const hitCalls = api.factoryCalls();
	api.resetFactoryCalls();
	for (let index = 0; index < 32; index++) {
		const key = ['a', 'b', 'c', 'd', 'e'][index % 5];
		props = { ...props, [key]: props[key] + 1, tick: index + 33 };
		render();
	}
	const missCalls = api.factoryCalls();
	const output = container.textContent;
	root.unmount();
	assert.equal(container.textContent, '');
	container.remove();
	assert.equal(mountedCalls, 1, 'One initial use() factory per owner');
	assert.equal(hitCalls, 0, 'Stable five-dependency use() creation is cached');
	assert.equal(missCalls, 32, 'Each changed dependency refreshes use() creation once');
	return {
		target: entry.target,
		nativeReads: entry.nativeReads,
		mountedCalls,
		hitCalls,
		missCalls,
		output,
	};
}

const window = setupDom();
let failure;
try {
	for (const target of roots) {
		target.compilerInputs = compilerSnapshot(target.root);
		if (target.label === 'baseline') {
			const ref = payload.environment.baselineRef;
			for (const file of target.compilerInputs)
				assert.equal(
					file.sha256,
					hash(git('show', ref + ':' + file.path)),
					'Baseline compiler differs from Git: ' + file.path,
				);
		}
	}
	payload.compilerInputs = roots.map(({ label, compilerInputs }) => ({
		label,
		inputs: compilerInputs,
	}));
	payload.collectorControls = [];
	for (const target of roots)
		payload.collectorControls.push(
			await runNativeCollectorControls(target, { build, readInput, hash, repo: REPO, scratch }),
		);
	const entries = [];
	for (const target of roots) {
		entries.push(...(await buildCollector(target)));
		for (const scenario of CASES) {
			for (const nativeReads of scenario.reads ? [true] : [false, true]) {
				for (const mode of ['client', 'server'])
					entries.push(await buildCase(target, scenario, nativeReads, mode));
			}
		}
		for (const nativeReads of [false, true])
			deterministic.push(
				fiveDependencies(
					await buildCase(
						target,
						{ name: 'five-dependencies', component: 'FiveDependencyUse', reads: 0 },
						nativeReads,
						'client',
					),
				),
			);
	}
	const raw = new Map(entries.map((entry) => [entry.name, []]));
	for (let sample = -warmups; sample < samples; sample++) {
		const ordered = sample % 2 === 0 ? entries : [...entries].reverse();
		for (const entry of ordered) {
			const measurement =
				entry.mode === 'client'
					? measureClient(entry)
					: entry.mode === 'server'
						? measureServer(entry)
						: measureCollector(entry);
			if (sample >= 0) raw.get(entry.name).push(measurement);
		}
		console.log(
			`Native collection ${sample < 0 ? 'warmup ' + (sample + warmups + 1) : 'sample ' + (sample + 1)} complete; semantic controls passed.`,
		);
	}
	for (const entry of entries) {
		const rawSamples = raw.get(entry.name);
		const ops = Object.fromEntries(
			Object.keys(rawSamples[0]).map((operation) => [
				operation,
				timingStatForJson(
					summarizeSamples(
						rawSamples.map((sample) => sample[operation]),
						{ scoreMode: 'mean' },
					),
				),
			]),
		);
		timings.push({
			name: entry.name,
			target: entry.target,
			nativeReads: entry.nativeReads,
			mode: entry.mode,
			scenario: entry.scenario.name,
			rawSamples,
			ops,
		});
	}
	for (const [file, contents] of snapshotInputs)
		assert.equal(hashFile(file), hash(contents), 'Source changed during measurement: ' + file);
	for (const target of roots.filter((item) => item.label === 'baseline')) {
		for (const [file, contents] of snapshotInputs) {
			if (!file.startsWith(path.join(target.root, 'packages/octane') + path.sep)) continue;
			const relative = path.relative(target.root, file).replaceAll('\\', '/');
			assert.equal(
				hash(contents),
				hash(git('show', payload.environment.baselineRef + ':' + relative)),
				'Baseline source differs from Git: ' + relative,
			);
		}
	}
	payload.sourceUnchanged = true;
} catch (error) {
	failure = error instanceof Error ? error.stack : String(error);
	console.error(failure);
} finally {
	await window.happyDOM.close();
	payload.finishedAt = new Date().toISOString();
	payload.sourceInputs = [...snapshotInputs].map(([file, contents]) => ({
		file,
		sha256: hash(contents),
	}));
	const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });
	payload.targets = [
		...timings.map(({ name, ops }) => ({ name, ops })),
		...deterministic.map((row) => ({
			name: row.target + (row.nativeReads ? ':native' : ':ordinary'),
			ops: {
				five_dependency_hit_calls: stat(row.hitCalls),
				five_dependency_miss_calls: stat(row.missCalls),
			},
		})),
		{
			name: 'work-model',
			ops: { five_dependency_hit_calls: stat(1), five_dependency_miss_calls: stat(32) },
		},
	];
	if (failure) payload.failed = failure;
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
	fs.rmSync(scratch, { recursive: true, force: true });
}
if (failure) process.exitCode = 1;
