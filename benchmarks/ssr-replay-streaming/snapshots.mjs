// Repeated component replay checkpoints after populated CSS/head collectors.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(process.env.SSR_SOURCE_ROOT || repo);
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = require('esbuild');
const { compile } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/index.js'))
);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-snapshots-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });
const sourcePath = path.join(sourceRoot, 'packages/octane/src/runtime.server.ts');
const original = fs.readFileSync(sourcePath, 'utf8');
const seedCount = 32;
const source =
	`import { preload, preinit, preconnect } from 'octane';\n` +
	Array.from(
		{ length: seedCount },
		(_, i) =>
			`export function Seed${i}() @{\npreload('/transfer-${i}.js', {as:'script',integrity:'seed-${i}'});\npreconnect('https://seed-${i}.example');\npreinit('/sheet-${i}.css', {as:'style',precedence:'p${i % 3}'});\n<div class="seed-${i}"><style>.seed-${i} { --seed-${i}: ${i}; }</style>seed-${i}</div>\n}`,
	).join('\n') +
	`\nexport function Leaf(p) @{\nif(p.mutate) preload('/leaf-' + p.index + '.js',{as:'script',integrity:'leaf-' + p.index});\n<span>{p.index as string}</span>\n}`;
const compiled = compile(source, 'ssr-snapshot-benchmark.tsrx', {
	mode: 'server',
	hmr: false,
}).code;
fs.writeFileSync(path.join(temp, 'fixture.js'), compiled);
function instrument(source) {
	for (const [marker, body] of [
		[
			'function snapshotMap<K, V>(map: Map<K, V> | null | undefined): Map<K, V> | null {',
			'if (map != null && map.size > 0) { globalThis.__snapshotWork.copies++; globalThis.__snapshotWork.entries += map.size; }',
		],
		[
			'function snapshotSet<T>(set: Set<T> | null | undefined): Set<T> | null {',
			'if (set != null && set.size > 0) { globalThis.__snapshotWork.copies++; globalThis.__snapshotWork.entries += set.size; }',
		],
		[
			'function snapshotList<T>(list: readonly T[] | null | undefined): T[] {',
			'if (list != null && list.length > 0) { globalThis.__snapshotWork.lists++; globalThis.__snapshotWork.listEntries += list.length; }',
		],
		[
			'function snapshotScopedCounts(counts: ScopedCounts | null | undefined): ScopedCounts | null {',
			'if (Array.isArray(counts) && counts.length > 0) { globalThis.__snapshotWork.lists++; globalThis.__snapshotWork.listEntries += counts.length; }',
		],
		[
			'function snapshotVtStack(): Array<{ candidate: VtSsrCandidate; consumed: boolean }> {',
			'if (VT_SSR_STACK.length > 0) { globalThis.__snapshotWork.lists++; globalThis.__snapshotWork.listEntries += VT_SSR_STACK.length; }',
		],
	]) {
		assert.equal(source.split(marker).length, 2, marker);
		source = source.replace(marker, marker + '\n' + body);
	}
	return source;
}
async function bundle(observed) {
	const output = await build({
		stdin: {
			contents: `export * from ${JSON.stringify(path.join(sourceRoot, 'packages/octane/src/server/index.ts'))}; export * as fixture from ${JSON.stringify(path.join(temp, 'fixture.js'))};`,
			resolveDir: repo,
			sourcefile: 'snapshot-entry.js',
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
				name: 'snapshot-source',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/server)?$/ }, () => ({
						path: path.join(sourceRoot, 'packages/octane/src/server/index.ts'),
					}));
					if (observed)
						plugin.onLoad({ filter: /runtime\.server\.ts$/ }, () => ({
							contents: instrument(original),
							loader: 'ts',
						}));
				},
			},
		],
	});
	const text = output.outputFiles[0].text,
		file = path.join(temp, observed ? 'observed.mjs' : 'clean.mjs');
	fs.writeFileSync(file, text);
	return {
		runtime: await import(pathToFileURL(file).href),
		bytes: Buffer.byteLength(text),
		sha256: hash(text),
	};
}
function workload(rt, seeds, leaves, mutate, stream = false) {
	const { createElement: h, fixture } = rt;
	function Root() {
		return h(
			'main',
			null,
			...Array.from({ length: seeds }, (_, i) => h(fixture['Seed' + i])),
			...Array.from({ length: leaves }, (_, i) => h(fixture.Leaf, { index: i, mutate })),
		);
	}
	if (!stream) return () => rt.renderToString(Root);
	return async () => {
		const output = await rt.renderToReadableStream(h(rt.Suspense, { fallback: null }, h(Root)));
		return { html: await new Response(output).text(), css: '' };
	};
}
try {
	const clean = await bundle(false),
		observed = await bundle(true),
		targets = [];
	for (const [name, seeds, leaves, mutate, stream] of [
		['empty', 0, 128, false],
		['populated-seed', seedCount, 0, false],
		['populated-stable', seedCount, 128, false],
		['populated-changing', seedCount, 128, true],
		['nested-stream', seedCount, 16, false, true],
	]) {
		const render = workload(clean.runtime, seeds, leaves, mutate, stream),
			expected = await render();
		assert.equal((expected.html.match(/<span>/g) || []).length, leaves);
		for (let i = 0; i < seeds; i++) {
			assert.ok((expected.css + expected.html).includes('--seed-' + i + ':'));
			assert.ok(expected.html.includes('/sheet-' + i + '.css'));
		}
		for (let i = 0; i < leaves; i++)
			if (mutate) assert.ok(expected.html.includes('/leaf-' + i + '.js'));
		globalThis.__snapshotWork = { copies: 0, entries: 0, lists: 0, listEntries: 0 };
		const result = await workload(observed.runtime, seeds, leaves, mutate, stream)();
		assert.deepEqual(result, expected, 'observers preserve complete HTML/CSS');
		const work = { ...globalThis.__snapshotWork };
		if (stream)
			assert.ok(
				work.lists > 0 && work.listEntries > 0,
				'nested stream activates list-copy observer',
			);
		const samples = [];
		if (!stream && process.env.SNAPSHOT_TIMING === '1') {
			for (let i = 0; i < 30; i++) Buffer.byteLength(render().html);
			for (let i = 0; i < 31; i++) {
				const start = performance.now();
				for (let j = 0; j < 8; j++) {
					const out = render();
					Buffer.byteLength(out.html);
					Buffer.byteLength(out.css);
				}
				samples.push((performance.now() - start) / 8);
			}
			samples.sort((a, b) => a - b);
		}
		targets.push({
			name,
			ops: {
				collection_copies: stat(work.copies),
				copied_entries: stat(work.entries),
				list_copies: stat(work.lists),
				copied_list_entries: stat(work.listEntries),
				...(samples.length
					? {
							render: {
								score: samples[15],
								median: samples[15],
								min: samples[0],
								samples: samples.length,
							},
						}
					: {}),
			},
			meta: { seeds, leaves, mutate, stream: !!stream, outputHash: hash(JSON.stringify(expected)) },
		});
	}
	const payload = {
		suite: 'ssr-replay-streaming',
		iterations: 1,
		targets,
		meta: {
			node: process.version,
			v8: process.versions.v8,
			platform: process.platform,
			arch: process.arch,
			source: hash(original),
			bundleBytes: clean.bytes,
			bundleSha256: clean.sha256,
		},
	};
	console.log(JSON.stringify(payload, null, 2));
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
} finally {
	fs.rmSync(temp, { recursive: true, force: true });
}
