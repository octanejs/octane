// Deterministic, same-run production compiler A/B. The clean bundles establish
// semantics and shipped-code cost. Separately instrumented copies count source
// creation events; they are never timed and are not claims about V8 heap bytes.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { constants as zlibConstants, gzipSync } from 'node:zlib';

import { COUNTER_GLOBAL, emptyCounters, instrumentJavaScript } from './instrument.mjs';

const ROOT = import.meta.dirname;
const REPO = path.resolve(process.env.OCTANE_MEMO_ROOT || path.join(ROOT, '../..'));
const DEPENDENCY_REPO = path.resolve(process.env.OCTANE_MEMO_EXTERNAL_ROOT || REPO);
const OCTANE_ROOT = path.join(REPO, 'packages/octane');
const SOURCE_ROOT = path.join(OCTANE_ROOT, 'src');
const requireDependencies = createRequire(
	path.join(DEPENDENCY_REPO, 'packages/octane/package.json'),
);
const { build, transformSync, version: esbuildVersion } = requireDependencies('esbuild');
const { parseModule, builders } = requireDependencies('@tsrx/core');
const { print: esrapPrint } = requireDependencies('esrap');
const esrapTsx = requireDependencies('esrap/languages/tsx').default;
const { Window } = await import(pathToFileURL(requireDependencies.resolve('happy-dom')).href);
const { compile } = await import(pathToFileURL(path.join(SOURCE_ROOT, 'compiler/index.js')).href);
const { slotHooks } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'compiler/slot-hooks.js')).href
);
const { decodeSourceMappings } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'compiler/fat-segments.js')).href
);
const exportsMap = JSON.parse(
	fs.readFileSync(path.join(OCTANE_ROOT, 'package.json'), 'utf8'),
).exports;

const REPEATS = 32;
const CASES = [
	{ name: 'declaration', component: 'Declaration' },
	{ name: 'identifier_deps', component: 'IdentifierDeps', runtimeFallback: true },
	{ name: 'direct_return', component: 'DirectReturn', hitArraysPerRender: 2 },
	{ name: 'nested_expression', component: 'NestedExpression' },
	{ name: 'returned_jsx', component: 'ReturnedJsx', hitArraysPerRender: 1 },
	{ name: 'destructured', component: 'Destructured' },
	{ name: 'custom_hook', component: 'CustomHook', pairs: 2, hitArraysPerRender: 2 },
	{ name: 'explicit_slot', component: 'ExplicitSlot' },
	{ name: 'plain_hook', component: 'PlainHook', hitArraysPerRender: 2 },
	{
		name: 'plain_explicit_slot',
		component: 'PlainExplicitSlot',
		pairs: 2,
		hitArraysPerRender: 2,
	},
	{ name: 'manual_slot_hook', component: 'ManualSlotHook', pairs: 2, hitArraysPerRender: 2 },
	{ name: 'null_deps', component: 'NullDeps', alwaysFresh: true },
	{ name: 'conditional', component: 'Conditional', conditional: true },
];
const APP_FILES = [
	path.join(ROOT, 'cases.tsrx'),
	path.join(ROOT, 'plain-hooks.ts'),
	path.join(ROOT, 'returned-jsx.tsx'),
	path.join(ROOT, 'manual-hooks.ts'),
];
const val = (score) => ({ score, median: score, min: score, samples: 1 });
const bytes = (source) => Buffer.byteLength(source);
const gzipBytes = (source) => gzipSync(source, { level: zlibConstants.Z_BEST_COMPRESSION }).length;
const print = (ast) => esrapPrint(ast, esrapTsx()).code;
const instrument = (source, filename, owner) =>
	instrumentJavaScript(source, filename, owner, { parseModule, builders, print });
const asJavaScript = (source, filename) =>
	transformSync(source, {
		loader: filename.endsWith('.ts') ? 'ts' : 'js',
		format: 'esm',
		target: 'esnext',
		sourcefile: filename,
	}).code;

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
	return null;
}

function compileApplication(inlineHookMemo) {
	const sources = new Map();
	for (const filename of [APP_FILES[0], APP_FILES[2]]) {
		const componentSource = fs.readFileSync(filename, 'utf8');
		const compiled = compile(componentSource, filename, {
			mode: 'client',
			hmr: false,
			dev: false,
			autoMemo: false,
			inlineHookMemo,
		});
		assert.equal(compiled.diagnostics.length, 0, 'benchmark fixture emitted compiler diagnostics');
		sources.set(filename, compiled.code);
	}
	for (const [filename, manualSlots] of [
		[APP_FILES[1], false],
		[APP_FILES[3], true],
	]) {
		const plainSource = fs.readFileSync(filename, 'utf8');
		const slotted = slotHooks(plainSource, filename, {
			environment: 'client',
			hmr: false,
			profile: false,
			inlineHookMemo,
			manualSlots,
		});
		sources.set(filename, asJavaScript(slotted?.code ?? plainSource, filename));
	}
	return sources;
}

function octaneRequest(request) {
	const key = request === 'octane' ? '.' : './' + request.slice('octane/'.length);
	const entry = exportsMap[key];
	const target = typeof entry === 'string' ? entry : entry?.import || entry?.default;
	if (typeof target !== 'string') throw new Error(`Unmapped benchmark runtime import ${request}`);
	return path.resolve(OCTANE_ROOT, target);
}

async function bundleApplication(sources, outfile) {
	const result = await build({
		entryPoints: [path.join(ROOT, 'entry.mjs')],
		absWorkingDir: REPO,
		outfile,
		bundle: true,
		write: false,
		sourcemap: 'external',
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"' },
		nodePaths: [
			path.join(DEPENDENCY_REPO, 'packages/octane/node_modules'),
			path.join(DEPENDENCY_REPO, 'node_modules'),
		],
		plugins: [
			{
				name: 'hook-memo-benchmark',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => ({
						path: octaneRequest(request),
					}));
					plugin.onLoad({ filter: /\.(?:tsrx|tsx|ts|js)$/ }, ({ path: filename }) => {
						const application = sources.get(filename);
						if (application === undefined) return null;
						return {
							contents: application,
							loader: 'js',
							resolveDir: path.dirname(filename),
						};
					});
				},
			},
		],
	});
	assert.equal(result.outputFiles.length, 2, 'expected one self-contained bundle and source map');
	return {
		code: result.outputFiles.find((file) => file.path === outfile).text,
		map: JSON.parse(result.outputFiles.find((file) => file.path === outfile + '.map').text),
	};
}

function sourceOwner(map, generatedFile) {
	const applicationFiles = new Set(APP_FILES);
	const owners = map.sources.map((source) => {
		const filename = path.resolve(path.dirname(generatedFile), map.sourceRoot || '', source);
		if (applicationFiles.has(filename)) return 'application';
		if (filename.startsWith(SOURCE_ROOT + path.sep)) return 'runtime';
		return null;
	});
	const lines = decodeSourceMappings(map.mappings);
	return (node) => {
		const position = node.loc?.start;
		if (!position) return null;
		const segments = lines[position.line - 1] || [];
		let lower = 0;
		let upper = segments.length;
		while (lower < upper) {
			const middle = (lower + upper) >>> 1;
			if (segments[middle][0] <= position.column) lower = middle + 1;
			else upper = middle;
		}
		const segment = segments[lower - 1];
		return segment?.length >= 4 ? owners[segment[1]] : null;
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

function summarizedCounters(counters) {
	return {
		functions: counters.application_functions + counters.runtime_functions,
		arrays:
			counters.application_arrayLiterals +
			counters.application_arrayConstructors +
			counters.application_restArrays +
			counters.runtime_arrayLiterals +
			counters.runtime_arrayConstructors +
			counters.runtime_restArrays,
		application_functions: counters.application_functions,
		application_array_literals: counters.application_arrayLiterals,
		runtime_functions: counters.runtime_functions,
		runtime_rest_arrays: counters.runtime_restArrays,
	};
}

function eligibleTotals(measurements) {
	const counts = {
		eligible_hit_functions: 0,
		eligible_hit_application_array_literals: 0,
		eligible_hit_arrays: 0,
		eligible_miss_functions: 0,
	};
	const budgets = { ...counts };
	for (const fixture of CASES) {
		if (fixture.runtimeFallback || fixture.alwaysFresh) continue;
		const hit = summarizedCounters(measurements[`${fixture.name}_hit`].counters);
		const miss = summarizedCounters(measurements[`${fixture.name}_miss`].counters);
		counts.eligible_hit_functions += hit.functions;
		counts.eligible_hit_application_array_literals += hit.application_array_literals;
		counts.eligible_hit_arrays += hit.arrays;
		counts.eligible_miss_functions += miss.functions;
		// Positive references let the ratio runner enforce an exact zero ceiling.
		budgets.eligible_hit_functions += REPEATS;
		budgets.eligible_hit_application_array_literals += REPEATS;
		// The residual arrays belong to custom-hook/JSX caller plumbing, not
		// memo dependency literals. Each invalidation must create a fresh callback.
		budgets.eligible_hit_arrays += REPEATS * (fixture.hitArraysPerRender ?? 0);
		budgets.eligible_miss_functions += REPEATS * (fixture.pairs ?? 1);
	}
	return { counts, budgets };
}

function exercise(bundle, observed) {
	const measurements = {};
	const semanticSnapshot = {};
	for (const fixture of CASES) {
		const component = bundle[fixture.component];
		assert.equal(typeof component, 'function', fixture.component);
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = bundle.createRoot(container);
		const pairs = fixture.pairs ?? 1;
		let records = [];
		let previous = null;
		const observe = (box, callback) => records.push({ box, callback });

		function render(dep, tick, enabled = true) {
			records = [];
			bundle.flushSync(() => root.render(component, { dep, tick, enabled, observe }));
			const expectedValues = enabled
				? Array.from({ length: pairs }, (_, index) => dep + index)
				: [];
			assert.equal(
				container.textContent,
				`${tick}:${enabled ? expectedValues.join(',') : 'off'}`,
				fixture.name,
			);
			assert.equal(records.length, expectedValues.length, `${fixture.name} observations`);
			for (let index = 0; index < records.length; index++) {
				const record = records[index];
				assert.equal(record.box.value, expectedValues[index], `${fixture.name} value`);
				assert.equal(
					record.callback(),
					record.box.value * 1000 + record.box.tick,
					`${fixture.name} closure capture`,
				);
			}
			if (records.length === 2) {
				assert.notEqual(records[0].box, records[1].box, `${fixture.name} isolated memo values`);
				assert.notEqual(
					records[0].callback,
					records[1].callback,
					`${fixture.name} isolated callbacks`,
				);
			}
			return records;
		}

		function compare(next, mode, tick) {
			for (let index = 0; index < next.length; index++) {
				const record = next[index];
				if (mode === 'same') {
					assert.equal(record.box, previous[index].box, `${fixture.name} stable memo value`);
					assert.equal(
						record.callback,
						previous[index].callback,
						`${fixture.name} stable callback`,
					);
				} else {
					assert.equal(record.box.tick, tick, `${fixture.name} refreshed capture`);
					if (previous !== null) {
						assert.notEqual(
							record.box,
							previous[index].box,
							`${fixture.name} invalidated memo value`,
						);
						assert.notEqual(
							record.callback,
							previous[index].callback,
							`${fixture.name} invalidated callback`,
						);
					}
				}
			}
			previous = next;
		}

		function phase(name, renders, work) {
			globalThis[COUNTER_GLOBAL] = emptyCounters();
			work();
			const counters = { ...globalThis[COUNTER_GLOBAL] };
			if (observed) measurements[`${fixture.name}_${name}`] = { renders, counters };
		}

		phase('mount', 1, () => compare(render(1, 0), 'fresh', 0));
		phase('hit', REPEATS, () => {
			for (let index = 0; index < REPEATS; index++) {
				const tick = index + 1;
				compare(render(1, tick), fixture.alwaysFresh ? 'fresh' : 'same', tick);
			}
		});
		phase('miss', REPEATS, () => {
			for (let index = 0; index < REPEATS; index++) {
				const tick = REPEATS + index + 1;
				compare(render(index + 2, tick), 'fresh', tick);
			}
		});
		if (fixture.conditional) {
			phase('disabled', 1, () => render(REPEATS + 1, REPEATS * 2 + 1, false));
			phase('reactivate', 1, () => compare(render(REPEATS + 1, REPEATS * 2 + 2), 'same'));
		}
		semanticSnapshot[fixture.name] = {
			html: container.innerHTML,
			values: previous.map(({ box, callback }) => ({
				...box,
				callbackResult: callback(),
				callbackName: callback.name,
			})),
		};
		phase('unmount', 0, () => root.unmount());
		assert.equal(container.innerHTML, '', `${fixture.name} teardown`);
		container.remove();
	}
	return { measurements, semanticSnapshot };
}

function codeSizes(sources, cleanBundle) {
	const minified = [...sources].map(
		([filename, code]) =>
			transformSync(code, { loader: 'js', minify: true, sourcefile: filename }).code,
	);
	const minifiedBundle = transformSync(cleanBundle, { loader: 'js', minify: true }).code;
	return {
		code_raw: [...sources.values()].reduce((sum, code) => sum + bytes(code), 0),
		code_minified: minified.reduce((sum, code) => sum + bytes(code), 0),
		code_gzip: minified.reduce((sum, code) => sum + gzipBytes(code), 0),
		bundle_minified: bytes(minifiedBundle),
		bundle_gzip: gzipBytes(minifiedBundle),
	};
}

function withoutCallbackNames(snapshot) {
	return Object.fromEntries(
		Object.entries(snapshot).map(([name, value]) => [
			name,
			{ ...value, values: value.values.map(({ callbackName, ...rest }) => rest) },
		]),
	);
}

function callbackNameDifferences(snapshot, reference) {
	const differences = [];
	for (const [fixture, value] of Object.entries(snapshot)) {
		for (let index = 0; index < value.values.length; index++) {
			const actual = value.values[index].callbackName;
			const expected = reference[fixture].values[index].callbackName;
			if (actual !== expected) differences.push({ fixture, index, actual, expected });
		}
	}
	return differences;
}

const runMetadata = {
	node: process.version,
	esbuild: esbuildVersion,
	tsrxCore: dependencyVersion('@tsrx/core'),
	repeats: REPEATS,
	cases: CASES,
	fixtureSha256: createHash('sha256')
		.update(
			APP_FILES.map(
				(filename) => path.basename(filename) + '\n' + fs.readFileSync(filename, 'utf8'),
			).join('\n'),
		)
		.digest('hex'),
	entrySha256: createHash('sha256')
		.update(fs.readFileSync(path.join(ROOT, 'entry.mjs')))
		.digest('hex'),
	observerSha256: createHash('sha256')
		.update(fs.readFileSync(path.join(ROOT, 'instrument.mjs')))
		.digest('hex'),
	runnerSha256: createHash('sha256')
		.update(fs.readFileSync(path.join(ROOT, 'run.mjs')))
		.digest('hex'),
	measurement: 'source creation events, not V8 heap allocations or timing',
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-hook-memo-'));
const window = setupDom();
const targets = [];
const onePerRender = {};
let expectedSemantics;
try {
	for (const [name, inlineHookMemo] of [
		['runtime-form', false],
		['inline', true],
	]) {
		const sources = compileApplication(inlineHookMemo);
		const cleanFile = path.join(tempDir, `${name}-clean.mjs`);
		const { code: cleanCode, map } = await bundleApplication(sources, cleanFile);
		fs.writeFileSync(cleanFile, cleanCode);
		const clean = exercise(await import(pathToFileURL(cleanFile).href), false);
		if (expectedSemantics === undefined) expectedSemantics = clean.semanticSnapshot;
		else
			assert.deepEqual(
				withoutCallbackNames(clean.semanticSnapshot),
				withoutCallbackNames(expectedSemantics),
				'compiler variants changed semantics',
			);
		const nameDifferences = callbackNameDifferences(clean.semanticSnapshot, expectedSemantics);

		const observedCode = instrument(cleanCode, cleanFile, sourceOwner(map, cleanFile));
		const observedFile = path.join(tempDir, `${name}-observed.mjs`);
		fs.writeFileSync(observedFile, observedCode);
		globalThis[COUNTER_GLOBAL] = emptyCounters();
		const observed = exercise(await import(pathToFileURL(observedFile).href), true);
		assert.deepEqual(
			observed.semanticSnapshot,
			clean.semanticSnapshot,
			'allocation observer changed semantics',
		);
		if (!inlineHookMemo) {
			const control = observed.measurements.declaration_hit.counters;
			assert.equal(
				control.application_functions,
				REPEATS * 2,
				'observer lost the two runtime-form callbacks',
			);
			assert.equal(
				control.application_arrayLiterals,
				REPEATS * 2,
				'observer lost the two runtime-form dependency arrays',
			);
		}
		const sizes = codeSizes(sources, cleanCode);
		const ops = Object.fromEntries(Object.entries(sizes).map(([key, value]) => [key, val(value)]));
		const totals = eligibleTotals(observed.measurements);
		for (const [metric, count] of Object.entries(totals.counts)) {
			ops[metric] = val(count);
			onePerRender[metric] = val(totals.budgets[metric]);
		}
		ops.callback_name_mismatches = val(nameDifferences.length);
		onePerRender.callback_name_mismatches = val(1);
		for (const [phase, measurement] of Object.entries(observed.measurements)) {
			for (const [metric, count] of Object.entries(summarizedCounters(measurement.counters))) {
				ops[`${phase}_${metric}`] = val(count);
				onePerRender[`${phase}_${metric}`] = val(measurement.renders || 1);
			}
		}
		targets.push({
			name,
			ops,
			meta: {
				run: runMetadata,
				measurements: observed.measurements,
				semantics: observed.semanticSnapshot,
				callbackNameDifferences: nameDifferences,
			},
		});
		console.log(
			`${name}: code ${sizes.code_minified} min / ${sizes.code_gzip} gzip; bundle ${sizes.bundle_minified} min / ${sizes.bundle_gzip} gzip`,
		);
		if (nameDifferences.length > 0) {
			console.log(`  callback-name mismatches: ${JSON.stringify(nameDifferences)}`);
		}
		for (const fixture of CASES) {
			const hit = summarizedCounters(observed.measurements[`${fixture.name}_hit`].counters);
			console.log(
				`  ${fixture.name}: ${hit.functions} function expressions, ${hit.arrays} array creations / ${REPEATS} dependency-hit renders`,
			);
		}
	}
	const payload = {
		suite: 'hook-memo',
		iterations: 1,
		targets: [
			...targets,
			{
				name: 'one-per-render',
				ops: onePerRender,
				meta: {
					description:
						'Fixed source-creation ceilings: one per render, per required fresh callback, or explicitly budgeted caller array.',
				},
			},
		],
		meta: runMetadata,
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
	console.log('Hook-memo value/identity and observer controls passed.');
} finally {
	delete globalThis[COUNTER_GLOBAL];
	await window.happyDOM.close();
	fs.rmSync(tempDir, { recursive: true, force: true });
}
