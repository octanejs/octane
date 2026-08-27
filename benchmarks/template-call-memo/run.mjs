// Same-source production comparison. The receiver methods live in this runner,
// outside the component AST, so observing calls cannot change purity analysis.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = import.meta.dirname;
const REPO = path.resolve(process.env.OCTANE_TEMPLATE_CALL_ROOT || path.join(HERE, '../..'));
const DEPENDENCIES = path.resolve(process.env.OCTANE_TEMPLATE_CALL_DEPS || REPO);
const OCTANE = path.join(REPO, 'packages/octane');
const requireDependencies = createRequire(path.join(DEPENDENCIES, 'packages/octane/package.json'));
const { build, transformSync, version: esbuildVersion } = requireDependencies('esbuild');
const { Window } = await import(pathToFileURL(requireDependencies.resolve('happy-dom')).href);
const { compile } = await import(pathToFileURL(path.join(OCTANE, 'src/compiler/index.js')).href);
const exportsMap = JSON.parse(fs.readFileSync(path.join(OCTANE, 'package.json'), 'utf8')).exports;
const fixtureFile = path.join(HERE, 'cases.tsrx');
const fixture = fs.readFileSync(fixtureFile, 'utf8');
const ROWS = 16;
const REPEATS = 32;
const stat = (score) => ({ score, median: score, min: score, samples: 1 });
const hash = (source) => createHash('sha256').update(source).digest('hex');

function dependencyVersion(name) {
	let directory = path.dirname(requireDependencies.resolve(name));
	while (directory !== path.dirname(directory)) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest)) {
			const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
			if (pkg.name === name) return pkg.version;
		}
		directory = path.dirname(directory);
	}
	throw new Error(`Missing dependency metadata for ${name}`);
}

async function buildFixture(strong, outfile) {
	const compiled = compile(fixture, fixtureFile, {
		mode: 'client',
		hmr: false,
		dev: false,
		strong,
	});
	assert.deepEqual(compiled.diagnostics, [], 'fixture compiler diagnostics');
	const result = await build({
		entryPoints: [path.join(HERE, 'entry.mjs')],
		outfile,
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [
			path.join(DEPENDENCIES, 'packages/octane/node_modules'),
			path.join(DEPENDENCIES, 'node_modules'),
		],
		plugins: [
			{
				name: 'template-call-fixture',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const entry = exportsMap[request === 'octane' ? '.' : './' + request.slice(7)];
						const target = typeof entry === 'string' ? entry : entry?.import || entry?.default;
						assert.equal(typeof target, 'string', `public runtime export ${request}`);
						return { path: path.resolve(OCTANE, target) };
					});
					plugin.onLoad({ filter: /\.tsrx$/ }, ({ path: filename }) => {
						assert.equal(filename, fixtureFile, 'unexpected fixture module');
						return { contents: compiled.code, loader: 'js', resolveDir: HERE };
					});
				},
			},
		],
	});
	const bundle = result.outputFiles[0].text;
	fs.writeFileSync(outfile, bundle);
	return {
		code_minified: Buffer.byteLength(transformSync(compiled.code, { minify: true }).code),
		bundle_gzip: gzipSync(transformSync(bundle, { minify: true }).code).length,
	};
}

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
			Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
	}
	return window;
}

function exercise(bundle, observed) {
	const measurements = {};
	const semantics = [];
	let reads = 0;
	let logs = 0;
	let assumedPureCalls = 0;
	const project = (value, suffix) => `${value}:${suffix}`;
	const calls = {
		computedMethod: 'format',
		format(value, suffix) {
			if (observed) assumedPureCalls++;
			return project(value, suffix);
		},
		useFormat(value, suffix) {
			if (observed) assumedPureCalls++;
			return project(value, suffix);
		},
		makeFormat() {
			if (observed) assumedPureCalls++;
			return project;
		},
		map(values, callback) {
			if (observed) assumedPureCalls++;
			return values.map(callback).join('');
		},
		tag(_strings, value, suffix) {
			if (observed) assumedPureCalls++;
			return `${value}${suffix}`;
		},
		Projector: class {
			constructor(value, suffix) {
				if (observed) assumedPureCalls++;
				this.value = project(value, suffix);
			}
		},
	};
	const originalLog = console.log;
	console.log = () => {
		if (observed) logs++;
	};
	try {
		for (const name of ['Rows', 'LoggedRows', 'CapturedRows', 'AssumedPureRows']) {
			function row(id, label = `row-${id}`) {
				return Object.freeze({
					id,
					label,
					read(suffix) {
						if (observed) reads++;
						return `${this.label}:${suffix}`;
					},
				});
			}
			let rows = Object.freeze(Array.from({ length: ROWS }, (_, index) => row(index)));
			let suffix = 'first';
			let tick = 0;
			let previousNodes = new Map();
			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = bundle.createRoot(container);
			const onRows = (next) => {
				rows = Object.freeze(next);
				render();
			};

			function check() {
				assert.equal(
					container.querySelector('output').textContent,
					String(tick),
					`${name}: parent update`,
				);
				const nodes = [...container.querySelectorAll('li')];
				assert.equal(nodes.length, rows.length, `${name}: row count`);
				for (let index = 0; index < rows.length; index++) {
					const item = rows[index];
					const node = nodes[index];
					assert.equal(node.getAttribute('data-row'), String(item.id), `${name}: order`);
					assert.equal(
						node.querySelector('span').textContent,
						`${item.label}:${suffix}`,
						`${name}: value`,
					);
					if (name === 'AssumedPureRows') {
						assert.deepEqual(
							[...node.querySelectorAll('span')].map((span) => span.textContent),
							Array.from({ length: 7 }, () => `${item.label}:${suffix}`),
							`${name}: every assumed-pure call shape`,
						);
					}
					if (previousNodes.has(item.id))
						assert.equal(node, previousNodes.get(item.id), `${name}: survivor identity`);
				}
				previousNodes = new Map(rows.map((item, index) => [item.id, nodes[index]]));
			}

			function render() {
				tick++;
				bundle.flushSync(() => root.render(bundle[name], { rows, suffix, tick, onRows, calls }));
				check();
			}

			function phase(phaseName, operation) {
				reads = logs = assumedPureCalls = 0;
				operation();
				measurements[`${name}_${phaseName}`] = { reads, logs, assumedPureCalls };
				semantics.push({
					name,
					phase: phaseName,
					tick,
					rows: [...container.querySelectorAll('li')].map((node) => [
						node.getAttribute('data-row'),
						node.textContent,
					]),
				});
			}

			try {
				phase('mount', render);
				phase('stable', () => {
					for (let index = 0; index < REPEATS; index++) render();
				});
				phase('append', () => {
					rows = Object.freeze([...rows, row(ROWS)]);
					render();
				});
				if (name === 'CapturedRows') {
					phase('remove', () => {
						bundle.flushSync(() => container.querySelector('[data-row="0"] button').click());
						check();
						assert.equal(rows.length, ROWS, 'remove uses the appended array');
						assert.equal(rows.at(-1).id, ROWS, 'remove retains the appended row');
						assert.ok(
							rows.every((item) => item.id !== 0),
							'original row removed',
						);
					});
				} else {
					phase('prepend', () => {
						rows = Object.freeze([row(ROWS + 1), ...rows]);
						render();
					});
					phase('snapshot', () => {
						rows = Object.freeze(rows.map((item) => (item.id === 0 ? row(0, 'changed') : item)));
						render();
					});
					phase('argument', () => {
						suffix = 'second';
						render();
					});
					phase('reorder', () => {
						rows = Object.freeze([...rows].reverse());
						render();
					});
				}
			} finally {
				root.unmount();
				assert.equal(container.innerHTML, '', `${name}: teardown`);
				container.remove();
			}
		}
	} finally {
		console.log = originalLog;
	}
	return { measurements, semantics };
}

function counts(measurements) {
	const total = (phase) =>
		['Rows', 'LoggedRows'].reduce((sum, name) => sum + measurements[`${name}_${phase}`].reads, 0);
	return {
		stable_reads: total('stable'),
		insert_reads: total('append') + total('prepend'),
		snapshot_reads: total('snapshot'),
		argument_reads: total('argument'),
		reorder_reads: total('reorder'),
		stable_logs: measurements.LoggedRows_stable.logs,
		captured_append_reads: measurements.CapturedRows_append.reads,
		captured_remove_reads: measurements.CapturedRows_remove.reads,
		assumed_pure_stable_calls: measurements.AssumedPureRows_stable.assumedPureCalls,
		assumed_pure_insert_calls:
			measurements.AssumedPureRows_append.assumedPureCalls +
			measurements.AssumedPureRows_prepend.assumedPureCalls,
		assumed_pure_snapshot_calls: measurements.AssumedPureRows_snapshot.assumedPureCalls,
		assumed_pure_argument_calls: measurements.AssumedPureRows_argument.assumedPureCalls,
		assumed_pure_reorder_calls: measurements.AssumedPureRows_reorder.assumedPureCalls,
	};
}

const runMetadata = {
	node: process.version,
	esbuild: esbuildVersion,
	tsrxCore: dependencyVersion('@tsrx/core'),
	rows: ROWS,
	repeats: REPEATS,
	fixtureSha256: hash(fixture),
	entrySha256: hash(fs.readFileSync(path.join(HERE, 'entry.mjs'))),
	runnerSha256: hash(fs.readFileSync(path.join(HERE, 'run.mjs'))),
	compilerSha256: hash(fs.readFileSync(path.join(OCTANE, 'src/compiler/compile.js'))),
	measurement: 'method invocations outside the compiled AST; no timing or heap claim',
};
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-template-call-memo-'));
const window = setupDom();
const targets = [];
let failure;
let expectedSemantics;
try {
	for (const [name, strong] of [
		['compatibility', false],
		['strong', true],
	]) {
		const outfile = path.join(directory, `${name}.mjs`);
		const sizes = await buildFixture(strong, outfile);
		const bundle = await import(pathToFileURL(outfile).href);
		const clean = exercise(bundle, false);
		const observed = exercise(bundle, true);
		assert.deepEqual(observed.semantics, clean.semantics, 'call observation changed output');
		if (expectedSemantics === undefined) expectedSemantics = clean.semantics;
		else assert.deepEqual(clean.semantics, expectedSemantics, 'Strong mode changed output');
		const work = counts(observed.measurements);
		targets.push({
			name,
			ops: Object.fromEntries(
				Object.entries({ ...work, ...sizes }).map(([key, value]) => [key, stat(value)]),
			),
			meta: { run: runMetadata, ...observed },
		});
		console.log(
			`${name}: ${JSON.stringify(work)}; ${sizes.code_minified} compiled bytes, ${sizes.bundle_gzip} bundle gzip bytes`,
		);
	}
	console.log(
		'Template-call output, keyed survivor identity, current event captures, and teardown controls passed.',
	);
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(failure);
} finally {
	await window.happyDOM.close();
	fs.rmSync(directory, { recursive: true, force: true });
}

const payload = {
	suite: 'template-call-memo',
	iterations: 1,
	targets: [
		...targets,
		{
			name: 'work-model',
			ops: Object.fromEntries(
				Object.entries({
					stable_reads: 1,
					insert_reads: 4,
					snapshot_reads: 2,
					argument_reads: (ROWS + 2) * 2,
					reorder_reads: 1,
					stable_logs: 1,
					captured_append_reads: ROWS + 1,
					captured_remove_reads: ROWS,
					assumed_pure_stable_calls: 1,
					assumed_pure_insert_calls: 14,
					assumed_pure_snapshot_calls: 7,
					assumed_pure_argument_calls: (ROWS + 2) * 7,
					assumed_pure_reorder_calls: 1,
				}).map(([key, value]) => [key, stat(value)]),
			),
		},
	],
	meta: runMetadata,
	...(failure ? { failed: failure } : {}),
};
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
if (failure) process.exitCode = 1;
