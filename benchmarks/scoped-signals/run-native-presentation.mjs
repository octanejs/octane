// Actual authored compiler + native binding writers + signal graph + StyleX.
// happy-dom timing is synchronous DOM work, not browser layout/paint evidence.
process.env.NODE_ENV = 'production';
process.env.OCTANE_COMPILE_FROZEN_AST = '1';
process.env.OCTANE_COMPILE_ASSERT_LOC = '1';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const here = path.dirname(import.meta.filename);
const repo = path.resolve(here, '../..');
const fixture = path.join(here, 'native-presentation');
const options = new Map();
for (const arg of process.argv.slice(2)) {
	const match = /^--(samples|updates|stylex-tooling-root)=(.+)$/.exec(arg);
	assert.ok(match && !options.has(match[1]), `Unknown or duplicate option: ${arg}`);
	options.set(match[1], match[2]);
}
const samples = Number(options.get('samples') ?? 7);
const updates = Number(options.get('updates') ?? 5000);
assert.ok(
	Number.isSafeInteger(samples) && samples >= 3 && Number.isSafeInteger(updates) && updates > 0,
);
const requireTool = createRequire(path.join(repo, 'package.json'));
const requireStyle = createRequire(
	path.join(
		path.resolve(options.get('stylex-tooling-root') ?? path.join(repo, 'packages/stylex')),
		'package.json',
	),
);
const { build } = requireTool('esbuild');
const { Window } = await import(pathToFileURL(requireTool.resolve('happy-dom')).href);
const babel = requireStyle('@babel/core');
const stylexPlugin = requireStyle('@stylexjs/babel-plugin');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'packages/octane/package.json')));
const inputs = new Map();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const read = (file) => {
	const source = fs.readFileSync(file, 'utf8');
	const previous = inputs.get(file);
	assert.ok(previous === undefined || previous === source, `Source changed during run: ${file}`);
	inputs.set(file, source);
	return source;
};
const compressed = (code) => ({
	raw: Buffer.byteLength(code),
	gzip: gzipSync(code, { level: 9 }).length,
	brotli: brotliCompressSync(code).length,
});
const compiled = [];
for (const file of [
	'package.json',
	'pnpm-lock.yaml',
	'pnpm-workspace.yaml',
	'packages/octane/package.json',
	'packages/stylex/package.json',
])
	read(path.join(repo, file));
read(import.meta.filename);
for (const file of fs.readdirSync(path.join(repo, 'packages/octane/src/compiler'), {
	recursive: true,
})) {
	if (/\.[cm]?js$/.test(file)) read(path.join(repo, 'packages/octane/src/compiler', file));
}

async function bundle(mode, entry) {
	const result = await build({
		absWorkingDir: repo,
		stdin: { contents: entry, resolveDir: fixture, sourcefile: `${mode}-entry.mjs` },
		bundle: true,
		write: false,
		metafile: true,
		minify: true,
		treeShaking: true,
		platform: mode === 'server' ? 'node' : 'browser',
		format: 'esm',
		target: 'es2022',
		legalComments: 'none',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'native-presentation-authored',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const entry = manifest.exports[request === 'octane' ? '.' : './' + request.slice(7)];
						const source = typeof entry === 'string' ? entry : entry?.default;
						assert.equal(typeof source, 'string', request);
						return { path: path.resolve(repo, 'packages/octane', source) };
					});
					plugin.onResolve({ filter: /^@octanejs\/stylex$/ }, () => ({
						path: path.join(repo, 'packages/stylex/src/index.ts'),
					}));
					plugin.onResolve({ filter: /^@stylexjs\/stylex(?:\/|$)/ }, ({ path: request }) => ({
						path: requireStyle.resolve(request),
					}));
					plugin.onResolve({ filter: /\.tsrx(?:\?.*)?$/ }, (args) => ({
						path: path.resolve(args.resolveDir, args.path),
					}));
					plugin.onLoad({ filter: /\.tsrx(?:\?.*)?$/ }, ({ path: id }) => {
						const file = id.split('?')[0];
						const result = compile(read(file), id, { mode, dev: false, hmr: false });
						assert.deepEqual(result.diagnostics ?? [], [], id);
						compiled.push({
							id: path.relative(repo, id),
							mode,
							...compressed(result.code),
							sha256: hash(result.code),
						});
						return { contents: result.code, loader: 'js', resolveDir: path.dirname(file) };
					});
					plugin.onLoad({ filter: /\.(?:[cm]?js|ts|json)$/ }, ({ path: file }) => {
						let source = read(file);
						if (file === path.join(fixture, 'styles.mjs')) {
							source = babel.transformSync(source, {
								filename: file,
								babelrc: false,
								configFile: false,
								plugins: [
									[
										stylexPlugin.default ?? stylexPlugin,
										{
											dev: false,
											runtimeInjection: false,
											importSources: ['@octanejs/stylex'],
										},
									],
								],
							}).code;
						}
						return {
							contents: source,
							loader: file.endsWith('.ts') ? 'ts' : file.endsWith('.json') ? 'json' : 'js',
							resolveDir: path.dirname(file),
						};
					});
				},
			},
		],
	});
	const code = result.outputFiles[0].text;
	const resolved = Object.keys(result.metafile.inputs);
	if (mode !== 'server')
		assert.ok(
			!resolved.some((file) => /\/src\/runtime(?:\.server)?\.ts$|\/react\//.test(file)),
			'Client graph imported a renderer',
		);
	const module = await import(
		'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
	);
	return { module, bytes: compressed(code), sha256: hash(code), resolved };
}

const window = new Window({ url: 'http://localhost/' });
for (const name of [
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
]) {
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value: name === 'window' ? window : window[name],
	});
}
const client = await bundle(
	'client',
	'export {activate} from "./activate.tsrx"; export {classes} from "./styles.mjs"; export {createScope} from "octane/signals";',
);
const server = await bundle(
	'server',
	'import {View} from "./View.tsrx"; import {renderToString} from "octane/server"; export function render(props) {return renderToString(View, props).html;}',
);
const activation = await bundle('client', 'export {activate} from "./activate.tsrx";');
const connector = await bundle(
	'client',
	'export {__createBindingSignals} from "octane/dom-binding-signals";',
);
assert.ok(
	!activation.resolved.some((file) => /signals\/(?:graph|facade)\.ts$/.test(file)),
	'Activation alone imported a signal engine',
);
const { activate, classes, createScope } = client.module;

function run(direct, count) {
	const scope = createScope({ scopeKey: `native-presentation-${direct}` });
	const active = scope.signal$('active', false);
	let progress = scope.signal$('progress', 0);
	const secondary = scope.signal$('secondary', 7);
	const caption = scope.signal$('caption', 'ready');
	const unrelated = scope.signal$('unrelated', 'initial');
	const counts = { snapshots: 0, projections: 0, stylex: 0 };
	const classValue = () => {
		counts.stylex++;
		return classes(active.get());
	};
	const classSignal = scope.derived$('classes', classValue);
	const listeners = new Set();
	let stops = [];
	const notify = () => {
		for (const listener of listeners) listener();
	};
	const watch = () => {
		for (const stop of stops) stop();
		stops = direct
			? []
			: [active, progress, secondary, caption, unrelated].map((signal) => signal.subscribe(notify));
	};
	const source = {
		getSnapshot() {
			counts.snapshots++;
			const values = direct
				? { classes: classSignal, progress, secondary, caption, unrelated }
				: {
						classes: classValue(),
						progress: progress.get(),
						secondary: secondary.get(),
						caption: caption.get(),
						unrelated: unrelated.get(),
					};
			const props = {};
			for (const [name, value] of Object.entries(values))
				Object.defineProperty(props, name, {
					enumerable: true,
					get() {
						counts.projections++;
						return value;
					},
				});
			return Object.freeze(props);
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	const container = document.createElement('div');
	container.innerHTML = server.module.render(source.getSnapshot());
	document.body.appendChild(container);
	const element = container.querySelector('section');
	const text = container.querySelector('span');
	const before = element.outerHTML;
	watch();
	const handle = activate(element, source);
	assert.equal(element.outerHTML, before, 'SSR adoption changed an equal presentation');
	const snapshot = () => ({
		classes: element.className,
		progress: element.style.getPropertyValue('--progress'),
		secondary: element.style.getPropertyValue('--secondary'),
		title: element.title,
		text: text.textContent,
	});
	const results = {};
	function measure(name, operation, amount) {
		counts.snapshots = counts.projections = counts.stylex = 0;
		const start = performance.now();
		for (let index = 1; index <= amount; index++) operation(index);
		results[name] = { ms: performance.now() - start, ...counts, final: snapshot() };
		assert.equal(container.querySelector('section'), element);
		assert.equal(container.querySelector('span'), text);
	}
	try {
		measure('progress', (index) => progress.set(index), count);
		assert.equal(element.style.getPropertyValue('--progress'), String(count));
		measure('unrelated', (index) => unrelated.set(`unrelated-${index}`), count);
		assert.equal(element.title, `unrelated-${count}`);
		measure('variant', () => active.set(true), 1);
		assert.equal(element.className, classes(true));
		measure('caption', () => caption.set('complete'), 1);
		assert.equal(text.textContent, 'complete');
		const oldProgress = progress;
		progress = scope.signal$('replacement', 9001);
		watch();
		measure('replace', notify, 1);
		assert.equal(element.style.getPropertyValue('--progress'), '9001');
		oldProgress.set(-1);
		assert.equal(element.style.getPropertyValue('--progress'), '9001');
		progress.set(9002);
		assert.equal(element.style.getPropertyValue('--progress'), '9002');
		const final = snapshot();
		handle.dispose();
		for (const stop of stops) stop();
		stops = [];
		progress.set(9003);
		active.set(false);
		caption.set('disposed');
		assert.deepEqual(snapshot(), final, 'Disposed binding changed native DOM');
		return results;
	} finally {
		handle.dispose();
		for (const stop of stops) stop();
		scope.dispose();
		container.remove();
	}
}

for (let warmup = 0; warmup < 2; warmup++) {
	run(false, Math.min(updates, 1000));
	run(true, Math.min(updates, 1000));
}
const runs = [];
for (let sample = 0; sample < samples; sample++) {
	const pair = {};
	for (const direct of sample % 2 ? [true, false] : [false, true])
		pair[direct ? 'direct' : 'coarse'] = run(direct, updates);
	for (const name of Object.keys(pair.coarse))
		assert.deepEqual(pair.coarse[name].final, pair.direct[name].final, name);
	assert.equal(pair.direct.progress.snapshots, 0);
	assert.equal(pair.direct.progress.projections, 0);
	assert.equal(pair.direct.progress.stylex, 0);
	assert.equal(pair.direct.unrelated.snapshots, 0);
	assert.equal(pair.direct.unrelated.projections, 0);
	assert.equal(pair.direct.unrelated.stylex, 0);
	assert.equal(pair.coarse.progress.stylex, updates);
	assert.equal(pair.coarse.progress.snapshots, updates);
	assert.equal(pair.coarse.progress.projections, updates * 5);
	assert.equal(pair.direct.variant.snapshots, 0);
	assert.equal(pair.direct.variant.projections, 0);
	assert.equal(pair.direct.variant.stylex, 1);
	assert.equal(pair.direct.caption.snapshots, 0);
	assert.equal(pair.direct.caption.projections, 0);
	assert.equal(pair.direct.caption.stylex, 0);
	assert.equal(pair.direct.replace.snapshots, 1);
	assert.equal(pair.direct.replace.projections, 5);
	assert.equal(pair.direct.replace.stylex, 0);
	runs.push(pair);
}
const timings = {};
for (const name of ['progress', 'unrelated'])
	for (const lane of ['coarse', 'direct'])
		timings[`${lane}-${name}`] = timingStatForJson(
			summarizeSamples(runs.map((pair) => pair[lane][name].ms)),
		);
for (const [file, content] of inputs)
	assert.equal(fs.readFileSync(file, 'utf8'), content, `Source drift: ${file}`);
const report = {
	suite: 'compiled-native-signal-presentation',
	samples,
	updates,
	warmups: 2,
	limits: [
		'Synchronous happy-dom work; not browser layout, paint, Safari or application latency.',
		'Both lanes use the same compiled view and native writers; only source granularity differs.',
		'Activation bytes exclude the already-present graph/StyleX; combined fixture bytes include them.',
		'Connector-only bytes are an isolated upper bound, not an incremental app bundle delta; shared dependencies overlap.',
	],
	environment: {
		node: process.version,
		platform: process.platform,
		stylexToolingRoot: options.get('stylex-tooling-root') ?? 'workspace',
		stylexEntry: requireStyle.resolve('@stylexjs/stylex'),
	},
	bytes: {
		activation: activation.bytes,
		connectorIsolated: connector.bytes,
		combined: client.bytes,
		server: server.bytes,
	},
	compiled,
	timings,
	runs,
	inputs: [...inputs].map(([file, source]) => ({ file, sha256: hash(source) })),
};
console.log(
	JSON.stringify(
		{
			suite: report.suite,
			samples,
			updates,
			bytes: report.bytes,
			timings,
			counters: runs[0],
			inputCount: inputs.size,
		},
		null,
		2,
	),
);
if (process.env.BENCH_JSON) {
	assert.ok(path.isAbsolute(process.env.BENCH_JSON), 'BENCH_JSON must be absolute');
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
await window.happyDOM.close();
