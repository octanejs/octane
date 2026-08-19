// Deterministic production work, not a timing benchmark. The two components
// render identical tables; only the compiler's literal-class proof differs.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSelectionScenario } from './selection-work/driver.mjs';

const ROOT = import.meta.dirname;
const REPO = path.resolve(process.env.OCTANE_SELECTION_ROOT || path.join(ROOT, '../..'));
const DEPENDENCY_REPO = path.resolve(process.env.OCTANE_SELECTION_EXTERNAL_ROOT || REPO);
const OCTANE_ROOT = path.join(REPO, 'packages/octane');
const SOURCE_ROOT = path.join(OCTANE_ROOT, 'src');
const requireDependencies = createRequire(
	path.join(DEPENDENCY_REPO, 'packages/octane/package.json'),
);
const { build, version: esbuildVersion } = requireDependencies('esbuild');
const { chromium } = requireDependencies('playwright');
const { compile } = await import(pathToFileURL(path.join(SOURCE_ROOT, 'compiler/index.js')).href);
const exportsMap = JSON.parse(
	fs.readFileSync(path.join(OCTANE_ROOT, 'package.json'), 'utf8'),
).exports;
const FIXTURE = path.join(ROOT, 'selection-work/rows.tsrx');
const ENTRY = path.join(ROOT, 'selection-work/entry.mjs');
const ROW_COUNTS = [10, 1000];
const TARGETS = [
	{ name: 'literal-class-work', component: 'LiteralClassRows' },
	{ name: 'dynamic-class-work', component: 'DynamicClassRows' },
];
const SELECTION_OPS = [
	'select_first',
	'reselect',
	'select_another',
	'reset',
	'reset_again',
	'alternate_cycle',
	'select_after_reorder',
	'reset_after_reorder',
	'select_after_refill',
	'reset_after_refill',
];
const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

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

function octaneRequest(request) {
	const key = request === 'octane' ? '.' : './' + request.slice('octane/'.length);
	const entry = exportsMap[key];
	const target = typeof entry === 'string' ? entry : entry?.import || entry?.default;
	if (typeof target !== 'string') throw new Error(`Unmapped runtime import ${request}`);
	return path.resolve(OCTANE_ROOT, target);
}

async function bundleApplication() {
	const compiled = compile(fs.readFileSync(FIXTURE, 'utf8'), FIXTURE, {
		mode: 'client',
		hmr: false,
		dev: false,
	});
	assert.equal(compiled.diagnostics.length, 0, 'selection fixture emitted compiler diagnostics');
	const result = await build({
		entryPoints: [ENTRY],
		absWorkingDir: REPO,
		bundle: true,
		write: false,
		format: 'iife',
		globalName: '__octaneSelectionWork',
		platform: 'browser',
		target: 'es2022',
		minify: true,
		logLevel: 'silent',
		define: {
			'process.env.NODE_ENV': '"production"',
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		nodePaths: [
			path.join(DEPENDENCY_REPO, 'packages/octane/node_modules'),
			path.join(DEPENDENCY_REPO, 'node_modules'),
		],
		plugins: [
			{
				name: 'keyed-selection-work',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => ({
						path: octaneRequest(request),
					}));
					plugin.onLoad({ filter: /\.tsrx$/ }, ({ path: filename }) =>
						filename === FIXTURE
							? { contents: compiled.code, loader: 'js', resolveDir: path.dirname(filename) }
							: null,
					);
				},
			},
		],
	});
	assert.equal(result.outputFiles.length, 1, 'expected one self-contained selection bundle');
	return result.outputFiles[0].text;
}

const metadata = {
	node: process.version,
	esbuild: esbuildVersion,
	tsrxCore: dependencyVersion('@tsrx/core'),
	esrap: dependencyVersion('esrap'),
	sourceRoot: REPO,
	runtimeSha256: sha256(path.join(SOURCE_ROOT, 'runtime.ts')),
	compilerSha256: sha256(path.join(SOURCE_ROOT, 'compiler/compile.js')),
	fixtureSha256: sha256(FIXTURE),
	entrySha256: sha256(ENTRY),
	driverSha256: sha256(path.join(ROOT, 'selection-work/driver.mjs')),
	measurement: 'label-property reads; no timing or heap-allocation claim',
};

const results = [];
let browser;
let failed;
try {
	const bundle = await bundleApplication();
	if (process.argv.includes('--build-only')) {
		console.log(`Production selection-work bundle: ${Buffer.byteLength(bundle)} bytes.`);
	} else {
		browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await page.addScriptTag({ content: bundle });
		const expectedSemantics = new Map();
		for (const target of TARGETS) {
			const ops = {};
			const measurements = {};
			for (const rowCount of ROW_COUNTS) {
				const input = { component: target.component, rowCount };
				const clean = await page.evaluate(runSelectionScenario, { ...input, observed: false });
				const observed = await page.evaluate(runSelectionScenario, { ...input, observed: true });
				assert.deepEqual(observed.semantics, clean.semantics, 'label observer changed semantics');
				if (!expectedSemantics.has(rowCount)) expectedSemantics.set(rowCount, clean.semantics);
				else
					assert.deepEqual(
						clean.semantics,
						expectedSemantics.get(rowCount),
						'literal and dynamic class arms changed semantics',
					);
				assert.ok(observed.counts.mount > 0, 'label observer did not see mounted labels');
				assert.ok(observed.counts.label_replacement > 0, 'label replacement skipped row work');
				assert.equal(observed.counts.reselect, 0, 'equal-value selection repeated row work');
				assert.equal(observed.counts.reset_again, 0, 'equal-value reset repeated row work');
				const reads = SELECTION_OPS.reduce((sum, name) => sum + observed.counts[name], 0);
				if (target.name === 'dynamic-class-work') {
					for (const name of SELECTION_OPS) {
						if (name === 'reselect' || name === 'reset_again') continue;
						assert.ok(observed.counts[name] > 0, `ordinary-row control lost ${name} reads`);
					}
					assert.ok(reads > 0, 'selection ratio denominator must be nonzero');
				}
				ops[`selection_label_reads_${rowCount}`] = stat(reads);
				for (const [name, count] of Object.entries(observed.counts)) {
					ops[`${name}_label_reads_${rowCount}`] = stat(count);
				}
				measurements[rowCount] = observed;
				console.log(`${target.name}, ${rowCount} rows: ${reads} selection label reads`);
			}
			results.push({ name: target.name, ops, meta: { run: metadata, measurements } });
		}
		assert.deepEqual(errors, [], 'selection-work browser errors');
		console.log('Selection class, label, identity, reset, and observer controls passed.');
	}
} catch (error) {
	failed = error instanceof Error ? error.message : String(error);
	console.error(error);
} finally {
	await browser?.close();
}

if (!process.argv.includes('--build-only')) {
	const payload = {
		suite: 'js-framework-selection-work',
		iterations: 1,
		targets: results,
		meta: metadata,
		...(failed ? { failed } : {}),
	};
	if (process.env.BENCH_JSON) {
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
	}
}
if (failed) process.exitCode = 1;
