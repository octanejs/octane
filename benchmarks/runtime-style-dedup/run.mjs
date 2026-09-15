// Identical component styles should not replace an unchanged replay generation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(process.env.SSR_SOURCE_ROOT || repo);
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = require('esbuild');
const { compile } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/index.js'))
);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-style-dedup-'));
const hash = (text) => createHash('sha256').update(text).digest('hex');
const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });
const fixtureSource = `
import { injectStyle } from 'octane/server';
export function Leaf(p) @{
  if (p.mode !== 'empty') injectStyle(p.styleId, p.css, p.nonce);
  <span>{p.index as string}</span>
}
export function CompiledLeaf(p) @{
  <span class="row"><style>.row { color: teal; }</style>{p.index as string}</span>
}
`;
const fixture = compile(fixtureSource, 'runtime-style-dedup.tsrx', {
	mode: 'server',
	hmr: false,
}).code;
fs.writeFileSync(path.join(temp, 'fixture.js'), fixture);

function instrument(source) {
	const write = 'CSS.set(id, nonce === undefined ? { css } : { css, nonce });';
	assert.equal(source.split(write).length, 2, 'one style record creation site');
	source = source.replace(write, 'globalThis.__styleWork.writes++; ' + write);
	const copy = 'function snapshotMap<K, V>(map: Map<K, V> | null | undefined): Map<K, V> | null {';
	assert.equal(source.split(copy).length, 2, 'one map snapshot helper');
	return source.replace(
		copy,
		copy +
			'\nif (map != null && map.size > 0) { globalThis.__styleWork.copies++; globalThis.__styleWork.entries += map.size; }',
	);
}

async function bundle(root, observed, label) {
	const runtimeSource = fs.readFileSync(
		path.join(root, 'packages/octane/src/runtime.server.ts'),
		'utf8',
	);
	const output = await build({
		stdin: {
			contents: `export * from ${JSON.stringify(path.join(root, 'packages/octane/src/server/index.ts'))}; export * as fixture from ${JSON.stringify(path.join(temp, 'fixture.js'))};`,
			resolveDir: repo,
			sourcefile: 'style-entry.js',
		},
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [path.join(repo, 'packages/octane/node_modules'), path.join(repo, 'node_modules')],
		plugins: [
			{
				name: 'style-source',
				setup(plugin) {
					plugin.onResolve(
						{ filter: /^octane(?:\/server|\/internal\/server)?$/ },
						({ path: id }) => ({
							path: path.join(
								root,
								'packages/octane/src',
								id === 'octane/internal/server' ? 'internal/server.ts' : 'server/index.ts',
							),
						}),
					);
					if (observed)
						plugin.onLoad({ filter: /runtime\.server\.ts$/ }, () => ({
							contents: instrument(runtimeSource),
							loader: 'ts',
						}));
				},
			},
		],
	});
	const text = output.outputFiles[0].text;
	const file = path.join(temp, label + '.mjs');
	fs.writeFileSync(file, text);
	return {
		runtime: await import(pathToFileURL(file).href),
		sourceHash: hash(runtimeSource),
		bundleHash: hash(text),
		bundleBytes: Buffer.byteLength(text),
		gzipBytes: gzipSync(text).length,
	};
}

function workload(rt, mode, count, seeds) {
	const { createElement: h } = rt;
	const rows = Array.from({ length: count }, (_, index) =>
		h(mode === 'compiled' ? rt.fixture.CompiledLeaf : rt.fixture.Leaf, {
			index,
			mode,
			styleId: mode === 'unique' ? 'row-' + index : 'row',
			css: '.row{--value:' + (mode === 'changed' ? index : 0) + '}',
			nonce: mode === 'nonce' ? String(index) : undefined,
		}),
	);
	const Root = () => {
		for (let i = 0; i < seeds; i++) rt.injectStyle('seed-' + i, '.seed-' + i + '{color:blue}');
		return h('main', null, rows);
	};
	return () => rt.renderToString(Root);
}

function check(result, mode, count, seeds) {
	assert.equal((result.html.match(/<span(?: |>)/g) || []).length, count, 'all rows render');
	for (let i = 0; i < count; i++) assert.ok(result.html.includes('>' + i + '</span>'), 'row text');
	const sheets = [
		...result.css.matchAll(/<style data-octane="([^"]+)"([^>]*)>([\s\S]*?)<\/style>/g),
	];
	for (let i = 0; i < seeds; i++) {
		const sheet = sheets.shift();
		assert.equal(sheet[1], 'seed-' + i, 'seed CSS insertion order');
		assert.equal(sheet[2], '', 'seed nonce');
		assert.equal(sheet[3], '.seed-' + i + '{color:blue}', 'seed CSS');
	}
	assert.equal(
		sheets.length,
		mode === 'empty' ? 0 : mode === 'unique' ? count : 1,
		'effective style count',
	);
	if (mode === 'compiled')
		assert.match(result.css, /color:\s*teal/, 'compiled scoped CSS survives');
	else if (mode !== 'empty') {
		assert.equal(sheets[0][1], mode === 'unique' ? 'row-0' : 'row');
		assert.equal(sheets[0][3], '.row{--value:' + (mode === 'changed' ? count - 1 : 0) + '}');
		assert.equal(sheets[0][2], mode === 'nonce' ? ' nonce="' + (count - 1) + '"' : '');
		if (mode === 'unique')
			assert.deepEqual(
				sheets.map((s) => s[1]),
				Array.from({ length: count }, (_, i) => 'row-' + i),
			);
	}
}

function sample(render) {
	const start = performance.now();
	for (let i = 0; i < 16; i++) {
		const result = render();
		Buffer.byteLength(result.html);
		Buffer.byteLength(result.css);
	}
	return (performance.now() - start) / 16;
}

try {
	const clean = await bundle(sourceRoot, false, 'clean');
	const observed = await bundle(sourceRoot, true, 'observed');
	const baseline = process.env.SSR_BASELINE_ROOT
		? await bundle(path.resolve(process.env.SSR_BASELINE_ROOT), false, 'baseline')
		: null;
	const targets = [];
	for (const [name, mode, count, seeds = 0] of [
		['empty', 'empty', 128],
		['single', 'stable', 1],
		['repeated', 'stable', 128],
		['compiled-single', 'compiled', 1],
		['compiled-repeated', 'compiled', 128],
		['seeded-single', 'stable', 1, 32],
		['seeded-repeated', 'stable', 128, 32],
		['changed', 'changed', 128],
		['unique', 'unique', 128],
		['nonce', 'nonce', 128],
	]) {
		const render = workload(clean.runtime, mode, count, seeds);
		const expected = render();
		check(expected, mode, count, seeds);
		assert.deepEqual(render(), expected, 'requests retain complete HTML/CSS without sharing state');
		globalThis.__styleWork = { writes: 0, copies: 0, entries: 0 };
		assert.deepEqual(
			workload(observed.runtime, mode, count, seeds)(),
			expected,
			'observer preserves complete output',
		);
		const work = { ...globalThis.__styleWork };
		const timing = { baseline: [], candidate: [] };
		if (baseline !== null) {
			const renderBaseline = workload(baseline.runtime, mode, count, seeds);
			assert.deepEqual(renderBaseline(), expected, 'baseline/candidate complete output');
			for (let i = 0; i < 40; i++) {
				renderBaseline();
				render();
			}
			for (let i = 0; i < 31; i++) {
				if (i % 2 === 0) {
					timing.baseline.push(sample(renderBaseline));
					timing.candidate.push(sample(render));
				} else {
					timing.candidate.push(sample(render));
					timing.baseline.push(sample(renderBaseline));
				}
			}
		}
		targets.push({
			name,
			ops: {
				style_records: stat(work.writes),
				collection_copies: stat(work.copies),
				copied_entries: stat(work.entries),
			},
			meta: {
				mode,
				count,
				seeds,
				htmlHash: hash(expected.html),
				cssHash: hash(expected.css),
				...(baseline === null ? {} : { timing }),
			},
		});
	}
	const metadata = ({ runtime, ...meta }) => meta;
	const payload = {
		suite: 'runtime-style-dedup',
		iterations: 1,
		targets,
		meta: {
			node: process.version,
			v8: process.versions.v8,
			platform: process.platform,
			arch: process.arch,
			fixtureHash: hash(fixture),
			candidate: metadata(clean),
			...(baseline === null ? {} : { baseline: metadata(baseline) }),
		},
	};
	console.log(JSON.stringify(payload, null, 2));
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
} finally {
	fs.rmSync(temp, { recursive: true, force: true });
}
