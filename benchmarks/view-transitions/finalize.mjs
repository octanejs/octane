import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { launchBrowser } from '../../test-utils/playwright-browser.ts';
import { hashOctaneSources } from '../activity/harness.mjs';
import { pairedRatio } from '../lib/stats.mjs';

const here = import.meta.dirname;
const source = path.resolve(here, '../..');
const { values } = parseArgs({
	options: { base: { type: 'string' }, mode: { type: 'string', default: 'native' } },
});
assert.ok(values.base, 'Pass --base=<baseline commit>');
const base = execFileSync('git', ['rev-parse', '--verify', values.base + '^{commit}'], {
	cwd: source,
	encoding: 'utf8',
}).trim();
const packageRoot = path.join(source, 'packages/octane');
const sourceHash = hashOctaneSources(packageRoot);
const deps = createRequire(path.join(source, 'package.json'));
const pkg = createRequire(path.join(source, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(deps.resolve('vite')));
const { octane } = await import(
	pathToFileURL(path.join(source, 'packages/octane/src/compiler/vite.js'))
);
const modules = ['view-transition', 'engine'];
const runtimePaths = modules.map((name) =>
	path.join(source, `packages/octane/src/runtime/${name}.ts`),
);
const baseline = Object.fromEntries(
	runtimePaths.map((file) => [
		file,
		execFileSync('git', ['show', `${base}:${path.relative(source, file)}`], {
			cwd: source,
			encoding: 'utf8',
			maxBuffer: 16 * 1024 * 1024,
		}),
	]),
);
const candidate = Object.fromEntries(
	runtimePaths.map((file) => [file, fs.readFileSync(file, 'utf8')]),
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const mode = values.mode;
assert.ok(['native', 'timing'].includes(mode));
const changedSources = execFileSync(
	'git',
	['diff', '--name-only', base, '--', 'packages/octane/src'],
	{ cwd: source, encoding: 'utf8' },
)
	.trim()
	.split('\n')
	.filter(Boolean);
assert.ok(
	changedSources.every((file) => runtimePaths.includes(path.join(source, file))),
	'The comparison may only override the two reviewed runtime modules',
);
function replace(text, from, to) {
	assert.equal(text.split(from).length, 2, from.slice(0, 160));
	return text.replace(from, to);
}
function transform(code, changed, observe, file) {
	if (observe === 'count') {
		if (file.endsWith('/view-transition.ts')) {
			if (changed)
				code = replace(
					code,
					'for (const block of blocks ?? VT_REGISTRY) {',
					'for (const block of blocks ?? VT_REGISTRY) { globalThis.__probe.visits++; if (blocks === undefined && !block.disposed) globalThis.__probe.classifications++;',
				);
			else
				code = replace(
					code,
					'for (const block of VT_REGISTRY) {\n\t\tif (block.disposed || vtScopeForBlock(block) !== group.owner) continue;',
					'for (const block of VT_REGISTRY) { globalThis.__probe.visits++; if (!block.disposed) globalThis.__probe.classifications++;\n\t\tif (block.disposed || vtScopeForBlock(block) !== group.owner) continue;',
				);
		} else if (changed)
			code = replace(
				code,
				'for (const block of VT_REGISTRY) {\n\t\t\t\t\t\tif (block.disposed) continue;',
				'for (const block of VT_REGISTRY) {\n\t\t\t\t\t\tif (block.disposed) continue; globalThis.__probe.classifications++;',
			);
	}
	if (observe === 'time' && file.endsWith('/engine.ts')) {
		code = replace(
			code,
			'const finalize = (): void => {',
			'const finalize = (): void => { const __start = performance.now(); try {',
		);
		code = replace(
			code,
			'if (drainError !== null) throw drainError.error;\n\t\t};\n\t\tconst afterResources',
			'if (drainError !== null) throw drainError.error; } finally { globalThis.__probe.finalizeMs = performance.now() - __start; }\n\t\t};\n\t\tconst afterResources',
		);
	}
	return code;
}
async function bundle(changed, observe = '', entry = path.join(here, 'finalize-fixture.tsrx')) {
	const loaded = [];
	const result = await build({
		configFile: false,
		root: here,
		logLevel: 'error',
		plugins: [
			{
				name: 'fix-current-source',
				enforce: 'pre',
				resolveId(id) {
					if (id === 'octane' || id.startsWith('octane/')) {
						const file = pkg.resolve(id);
						assert.ok(
							file.startsWith(path.join(source, 'packages/octane/src/')),
							'Unexpected Octane alias: ' + file,
						);
						return file;
					}
				},
				load(id) {
					if (runtimePaths.includes(id)) {
						loaded.push(id);
						return transform((changed ? candidate : baseline)[id], changed, observe, id);
					}
				},
			},
			octane({ hmr: false, profile: false }),
		],
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		build: {
			write: false,
			minify: true,
			target: 'esnext',
			lib: { entry, formats: ['iife'], name: 'Fixture' },
		},
	});
	assert.deepEqual(loaded.toSorted(), runtimePaths.toSorted());
	const code = (Array.isArray(result) ? result[0] : result).output.find(
		(file) => file.type === 'chunk',
	).code;
	return code;
}
const browser = await launchBrowser({ headless: true });
const metadata = {
	base,
	commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
	sourceHash,
	harnessHash: hash(fs.readFileSync(import.meta.filename)),
	lockfileHash: hash(fs.readFileSync(path.join(source, 'pnpm-lock.yaml'))),
	baselineHashes: Object.fromEntries(
		Object.entries(baseline).map(([file, text]) => [path.relative(source, file), hash(text)]),
	),
	candidateHashes: Object.fromEntries(
		Object.entries(candidate).map(([file, text]) => [path.relative(source, file), hash(text)]),
	),
	fixtureHash: hash(fs.readFileSync(path.join(here, 'finalize-fixture.tsrx'))),
	node: process.version,
	browser: browser.version(),
	platform: process.platform,
	arch: process.arch,
	mode,
	note:
		mode === 'timing'
			? 'Real Chromium DOM and layout; mocked native capture scheduling; only synchronous finalize timed, without per-boundary instrumentation. Not user-visible latency.'
			: 'Native Chromium scope captures; operation counts, not wall-time claims.',
};
const report = { metadata, results: [], bytes: [] };
const save = () => {
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
};
async function prepare(code, count, scoped) {
	const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setContent(
		'<!doctype html><style>main{display:grid;grid-template-columns:repeat(16,90px)}section{height:45px;contain:layout}button{width:24px}input{width:40px}::view-transition-group(*){animation-duration:1ms!important}</style><div id="root"></div>',
	);
	await page.evaluate((mocked) => {
		window.__probe = { visits: 0, classifications: 0, finalizeMs: 0 };
		window.__handles = [];
		for (const owner of [Element.prototype, document]) {
			const native = owner.startViewTransition;
			if (typeof native !== 'function') throw Error('Native scope transitions unavailable');
			owner.startViewTransition = function (...args) {
				let result;
				if (mocked) {
					const input = args[0];
					const updated = Promise.resolve().then(
						typeof input === 'function' ? input : input.update,
					);
					result = {
						ready: updated,
						updateCallbackDone: updated,
						finished: updated.then(() => {}),
						skipTransition() {},
					};
				} else result = Reflect.apply(native, this, args);
				window.__handles.push(result);
				result.ready.catch(() => {});
				result.finished.catch(() => {});
				return result;
			};
		}
	}, mode === 'timing');
	await page.addScriptTag({ content: code });
	await page.evaluate(
		({ count, scoped }) => {
			window.__fixture = Fixture.mount(count, scoped);
		},
		{ count, scoped },
	);
	return { page, errors };
}
async function update(page, count, scoped, generation, changed) {
	await page.evaluate((generation) => {
		window.__handles.length = 0;
		window.__probe = { visits: 0, classifications: 0, finalizeMs: 0 };
		window.__fixture.start(generation);
	}, generation);
	await page.waitForFunction(() => window.__handles.length > 0);
	const sample = await page.evaluate(async (generation) => {
		const handles = [...window.__handles];
		const ready = await Promise.allSettled(handles.map((handle) => handle.ready));
		const updated = await Promise.allSettled(handles.map((handle) => handle.updateCallbackDone));
		const finished = await Promise.allSettled(handles.map((handle) => handle.finished));
		const fulfilled = (list) => list.filter((result) => result.status === 'fulfilled').length;
		return {
			...window.__probe,
			nativeHandles: handles.length,
			ready: fulfilled(ready),
			updated: fulfilled(updated),
			finished: fulfilled(finished),
			control: window.__fixture.check(generation),
		};
	}, generation);
	assert.equal(sample.nativeHandles, scoped ? count : 1);
	assert.equal(sample.ready, sample.nativeHandles);
	assert.equal(sample.updated, sample.nativeHandles);
	assert.equal(sample.finished, sample.nativeHandles);
	assert.equal(sample.control.layouts, count * generation);
	assert.equal(sample.control.events, generation);
	if (mode === 'native') {
		assert.equal(sample.classifications, changed ? count * 2 : count * 2 * (scoped ? count : 1));
		assert.equal(sample.visits, changed ? count * 2 : sample.classifications);
	}
	return sample;
}
const results = report.results;
try {
	if (mode === 'native') {
		for (const changed of [false, true]) {
			const code = await bundle(changed, 'count');
			for (const scoped of [true, false])
				for (const count of [16, 64, 128, 256]) {
					const { page, errors } = await prepare(code, count, scoped);
					const samples = [];
					for (let generation = 1; generation <= 2; generation++)
						samples.push(await update(page, count, scoped, generation, changed));
					await page.evaluate(() => window.__fixture.unmount());
					assert.deepEqual(errors, []);
					await page.close();
					const result = { changed, scoped, count, assetHash: hash(code), samples };
					results.push(result);
					console.log(JSON.stringify(result));
					save();
				}
		}
	} else {
		const codes = [await bundle(false, 'time'), await bundle(true, 'time')];
		for (const scoped of [false, true])
			for (const count of [16, 256]) {
				const pages = [
					await prepare(codes[0], count, scoped),
					await prepare(codes[1], count, scoped),
				];
				const samples = [[], []];
				for (let generation = 1; generation <= 23; generation++) {
					for (const variant of generation % 2 ? [0, 1] : [1, 0]) {
						const sample = await update(
							pages[variant].page,
							count,
							scoped,
							generation,
							variant === 1,
						);
						if (generation > 3) samples[variant].push(sample);
					}
				}
				for (const item of pages) {
					await item.page.evaluate(() => window.__fixture.unmount());
					assert.deepEqual(item.errors, []);
					await item.page.close();
				}
				const median = (values) => {
					const sorted = values.slice().sort((a, b) => a - b);
					return (sorted[9] + sorted[10]) / 2;
				};
				const medians = samples.map((list) => median(list.map((item) => item.finalizeMs)));
				const result = {
					scoped,
					count,
					warmup: 3,
					measured: 20,
					medians,
					paired: pairedRatio(
						samples[0].map((item) => item.finalizeMs),
						samples[1].map((item) => item.finalizeMs),
					),
					samples,
				};
				results.push(result);
				console.log(JSON.stringify({ scoped, count, medians, paired: result.paired }));
				save();
			}
		const bytes = report.bytes;
		for (const scenario of ['active', 'root-static', 'hooks-state']) {
			for (const changed of [false, true]) {
				const entry =
					scenario === 'active'
						? path.join(here, 'finalize-fixture.tsrx')
						: path.join(source, 'benchmarks/bundle-size/fixtures/minimal', scenario + '.tsrx');
				const code = await bundle(changed, '', entry);
				let control = null;
				if (scenario !== 'active') {
					const page = await browser.newPage();
					await page.setContent('<div id="root"></div>');
					await page.addScriptTag({ content: code });
					control = await page.evaluate(() => Fixture.run(document.querySelector('#root')));
					assert.deepEqual(
						control,
						scenario === 'root-static'
							? { returnedText: 'generic', text: 'Octane', cleaned: true }
							: { before: '0', after: '1', clicks: 1, effects: 1, cleanups: 1, cleaned: true },
					);
					await page.close();
				}
				bytes.push({
					scenario,
					changed,
					control,
					hash: hash(code),
					raw: Buffer.byteLength(code),
					gzip: gzipSync(code).length,
					brotli: brotliCompressSync(code).length,
				});
			}
			if (scenario !== 'active')
				assert.deepEqual(
					bytes.at(-1),
					{ ...bytes.at(-2), changed: true },
					scenario + ' ordinary bundle control',
				);
		}
		save();
		console.log(JSON.stringify({ bytes }));
	}
	assert.equal(hashOctaneSources(packageRoot), sourceHash);
	assert.equal(
		hash(fs.readFileSync(path.join(here, 'finalize-fixture.tsrx'))),
		metadata.fixtureHash,
	);
	assert.equal(hash(fs.readFileSync(import.meta.filename)), metadata.harnessHash);
	assert.equal(hash(fs.readFileSync(path.join(source, 'pnpm-lock.yaml'))), metadata.lockfileHash);
	save();
} finally {
	await browser.close();
}
