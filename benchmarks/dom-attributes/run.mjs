// Keep observed routing work separate from the untouched production timing bundle.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(process.env.BENCH_SOURCE_ROOT || repo);
const pkg = path.join(sourceRoot, 'packages/octane');
const { compile } = await import(pathToFileURL(path.join(pkg, 'src/compiler/index.js')).href);
const exportsMap = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).exports;
const fixturePath = path.join(import.meta.dirname, 'cases.tsrx');
const fixture = fs.readFileSync(fixturePath, 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const inputs = {
	fixture: sha256(fixture),
	entry: sha256(fs.readFileSync(path.join(import.meta.dirname, 'entry.mjs'))),
};
const compiled = compile(fixture, fixturePath, { dev: false, hmr: false, mode: 'client' });
assert.deepEqual(compiled.diagnostics, []);

async function bundle(instrument) {
	const result = await build({
		entryPoints: [path.join(import.meta.dirname, 'entry.mjs')],
		bundle: true,
		write: false,
		minify: true,
		format: 'iife',
		platform: 'browser',
		target: 'es2022',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [path.join(repo, 'node_modules'), path.join(repo, 'packages/octane/node_modules')],
		plugins: [
			{
				name: 'attribute-work',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const entry = exportsMap[request === 'octane' ? '.' : './' + request.slice(7)];
						return { path: path.resolve(pkg, typeof entry === 'string' ? entry : entry.default) };
					});
					plugin.onLoad({ filter: /\.tsrx$/ }, () => ({
						contents: compiled.code,
						loader: 'js',
						resolveDir: import.meta.dirname,
					}));
					if (instrument)
						plugin.onLoad({ filter: /\/src\/runtime\.ts$/ }, ({ path: filename }) => {
							let contents = fs.readFileSync(filename, 'utf8');
							const entry =
								'export function setAttribute(el: Element, name: string, value: any): void {';
							assert.equal(
								contents.split(entry).length,
								2,
								'generic writer instrumentation must match once',
							);
							contents = contents.replace(entry, entry + '\n globalThis.__attributeRouting++;');
							return { contents, loader: 'ts', resolveDir: path.dirname(filename) };
						});
				},
			},
		],
	});
	return result.outputFiles[0].text;
}

const observedBundle = await bundle(true);
const timedBundle = await bundle(false);
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	await page.addScriptTag({ content: observedBundle });
	const observed = await page.evaluate(() => {
		const { createRoot, flushSync, Attributes, Metadata } = globalThis.attributeBench;
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const rows = Array.from({ length: 256 }, (_, id) => id);
		root.render(Attributes, { version: 0, rows });
		const first = container.querySelector('a');
		const work = {};
		for (const [name, version] of [
			['changed', 1],
			['unchanged', 1],
			['restored', 0],
		]) {
			globalThis.__attributeRouting = 0;
			flushSync(() => root.render(Attributes, { version, rows }));
			work[name] = globalThis.__attributeRouting;
			if (container.querySelector('a') !== first) throw new Error('survivor replaced');
			for (const a of container.querySelectorAll('a')) {
				if (
					a.title !== 'title-' + version ||
					a.getAttribute('href') !== '#v' + version ||
					a.dataset.n !== String(version)
				)
					throw new Error('attribute mismatch');
				const circle = a.querySelector('circle');
				if (
					circle.getAttribute('cx') !== String(version) ||
					circle.getAttribute('stroke-width') !== String(version)
				)
					throw new Error('SVG alias mismatch');
			}
		}
		root.unmount();
		const headRoot = createRoot(container);
		headRoot.render(Metadata, { version: 0 });
		const meta = document.head.querySelector('meta[name="description"]');
		const title = document.head.querySelector('title');
		const set = Element.prototype.setAttribute;
		let headWrites = 0;
		Element.prototype.setAttribute = function (...args) {
			if (this === title || this === meta) headWrites++;
			return set.apply(this, args);
		};
		try {
			for (let i = 0; i < 128; i++) flushSync(() => headRoot.render(Metadata, { version: 0 }));
			work.headStableWrites = headWrites;
			meta.setAttribute('content', 'foreign');
			title.textContent = 'foreign';
			flushSync(() => headRoot.render(Metadata, { version: 0 }));
			if (meta.getAttribute('content') !== 'description-0' || title.textContent !== 'title-0')
				throw new Error('head drift not repaired');
			flushSync(() => headRoot.render(Metadata, { version: 1 }));
			if (meta.getAttribute('content') !== 'description-1' || title.textContent !== 'title-1')
				throw new Error('head update mismatch');
		} finally {
			Element.prototype.setAttribute = set;
			headRoot.unmount();
			container.remove();
		}
		return work;
	});
	await page.close();
	const timingPage = await browser.newPage();
	await timingPage.addScriptTag({ content: timedBundle });
	const samples = await timingPage.evaluate(() => {
		const { createRoot, flushSync, Attributes } = globalThis.attributeBench;
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container),
			rows = Array.from({ length: 256 }, (_, id) => id);
		root.render(Attributes, { version: 0, rows });
		let version = 0;
		const out = [];
		for (let sample = -5; sample < 15; sample++) {
			const start = performance.now();
			for (let i = 0; i < 100; i++)
				flushSync(() => root.render(Attributes, { version: ++version, rows }));
			if (sample >= 0) out.push((performance.now() - start) / 100);
		}
		root.unmount();
		container.remove();
		return out;
	});
	const val = (score) => ({ score, median: score, min: score, samples: 1 });
	const result = {
		suite: 'dom-attributes',
		iterations: 1,
		sourceRoot,
		node: process.version,
		chromium: browser.version(),
		inputs,
		observed,
		targets: [
			{
				name: 'octane',
				ops: Object.fromEntries(Object.entries(observed).map(([key, score]) => [key, val(score)])),
			},
			{
				name: 'reference',
				ops: {
					changed: val(1280),
					unchanged: val(1),
					restored: val(1280),
					headStableWrites: val(384),
				},
			},
		],
		samplesMs: samples,
		medianMs: [...samples].sort((a, b) => a - b)[7],
		bundle: { minified: Buffer.byteLength(timedBundle), gzip: gzipSync(timedBundle).length },
	};
	if (process.env.BENCH_EXPECT_SPECIALIZED === '1') {
		assert.equal(observed.changed, 0);
		assert.equal(observed.restored, 0);
		assert.equal(observed.unchanged, 0);
		assert.equal(observed.headStableWrites, 0);
	}
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify(result));
} finally {
	await browser.close();
}
