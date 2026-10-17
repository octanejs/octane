import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { hashOctaneSources, octanePackageAt } from '../activity/harness.mjs';
import { semanticHtmlForVerification } from '../lib/stream-verify.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(repo, 'package.json'));
const { build, version: esbuildVersion } = require('esbuild');
const counter = '__octaneBoundaryWork';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });
export const initialBoundaryWork = () => ({
	prune_visits: 0,
	html_queries: 0,
	html_units: 0,
	batch_queries: 0,
	owner_buckets: 0,
	owner_edges: 0,
	full_passes: 0,
});
function once(text, from, to) {
	assert.equal(text.split(from).length, 2, from);
	return text.replace(from, to);
}
function instrument(source) {
	const start = source.indexOf('function pruneUnrepresentedStreamDescendants(');
	const end = source.indexOf('// Root suspension can abandon', start);
	assert.ok(start > 0 && end > start);
	let fn = source.slice(start, end);
	const loop = fn.includes('for (const childKey of children) {')
		? 'for (const childKey of children) {'
		: 'for (const [childKey, child] of stream.boundaries) {';
	fn = once(fn, loop, loop + ` globalThis.${counter}.prune_visits++;`);
	fn = once(
		fn,
		'ownerHtml.includes(',
		`(globalThis.${counter}.html_queries++, globalThis.${counter}.html_units += ownerHtml.length, ownerHtml.includes(`,
	);
	fn = once(
		fn,
		`STREAM_BOUNDARY_ATTR + '="' + child.id + '"')`,
		`STREAM_BOUNDARY_ATTR + '="' + child.id + '"'))`,
	);
	let result = source.slice(0, start) + fn + source.slice(end);
	if (source.includes('function representedStreamBoundaryIds(')) {
		const marker = 'function representedStreamBoundaryIds(html: string): Set<string> {';
		result = once(
			result,
			marker,
			marker +
				` globalThis.${counter}.batch_queries++; globalThis.${counter}.html_queries++; globalThis.${counter}.html_units += html.length;`,
		);
		result = once(
			result,
			'stream.boundaryChildren.set(owner, (children = new Set()))',
			`stream.boundaryChildren.set(owner, (children = (globalThis.${counter}.owner_buckets++, new Set())))`,
		);
		result = once(
			result,
			'children.add(childKey);',
			`globalThis.${counter}.owner_edges += Number(!children.has(childKey)); children.add(childKey);`,
		);
	}
	const pass = result.indexOf('function runFullFramedPass(');
	const signature = result.indexOf('): FullPassResult {', pass);
	assert.ok(pass > 0 && signature > pass);
	const body = signature + '): FullPassResult {'.length;
	return result.slice(0, body) + `globalThis.${counter}.full_passes++;` + result.slice(body);
}

export async function buildBoundaryRuntime({ revision, observed = false } = {}) {
	const selected = octanePackageAt(revision);
	const packageRoot = fs.realpathSync(selected.packageRoot);
	const runtimePath = path.join(packageRoot, 'src/runtime.server.ts');
	const source = fs.readFileSync(runtimePath, 'utf8');
	const packageSha256 = hashOctaneSources(packageRoot);
	const entries = JSON.parse(
		fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
	).exports;
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-boundaries-'));
	try {
		const output = await build({
			absWorkingDir: repo,
			stdin: {
				contents: `export { createElement, Suspense, ErrorBoundary, use, renderToPipeableStream } from 'octane/server';`,
				resolveDir: repo,
				loader: 'js',
			},
			bundle: true,
			write: false,
			minify: true,
			format: 'esm',
			platform: 'node',
			target: 'node22',
			metafile: true,
			define: { 'process.env.NODE_ENV': '"production"' },
			nodePaths: [path.join(repo, 'node_modules')],
			plugins: [
				{
					name: 'selected-octane-package',
					setup(plugin) {
						plugin.onResolve({ filter: /^octane(?:\/.*)?$/ }, ({ path: name }) => {
							const entry = entries[name === 'octane' ? '.' : '.' + name.slice('octane'.length)];
							assert.equal(typeof entry, 'string', name);
							return { path: path.join(packageRoot, entry) };
						});
						if (observed)
							plugin.onLoad({ filter: /[/\\]runtime\.server\.ts$/ }, () => ({
								contents: instrument(source),
								loader: 'ts',
								resolveDir: path.dirname(runtimePath),
							}));
					},
				},
			],
		});
		const inputs = Object.keys(output.metafile.inputs).filter(
			(file) => file.includes('/octane/src/') || file.startsWith('packages/octane/src/'),
		);
		assert.ok(inputs.length > 0);
		for (const file of inputs)
			assert.ok(
				fs.realpathSync(path.resolve(repo, file)).startsWith(packageRoot + path.sep),
				`Octane source escaped selected package: ${file}`,
			);
		assert.equal(
			hashOctaneSources(packageRoot),
			packageSha256,
			'Octane source changed during build',
		);
		const text = output.outputFiles[0].text,
			file = path.join(temp, 'runtime.mjs');
		fs.writeFileSync(file, text);
		return {
			runtime: await import(pathToFileURL(file)),
			metadata: {
				revision: selected.revision,
				packageRoot,
				packageSha256,
				runtimeSha256: hash(source),
				bundleSha256: hash(text),
				bytes: Buffer.byteLength(text),
				gzip: gzipSync(text).length,
				brotli: brotliCompressSync(text).length,
				esbuild: esbuildVersion,
				inputs,
			},
			dispose: () => fs.rmSync(temp, { recursive: true, force: true }),
		};
	} catch (error) {
		fs.rmSync(temp, { recursive: true, force: true });
		throw error;
	}
}
function deferred() {
	let resolve;
	const promise = new Promise((yes) => {
		resolve = yes;
	});
	return { promise, resolve };
}
export async function renderBoundaryFixture(rt, n, shape) {
	const first = deferred(),
		second = deferred(),
		never = new Promise(() => {});
	const chunks = [],
		releases = [];
	let end, fail;
	const done = new Promise((yes, no) => {
		end = yes;
		fail = no;
	});
	const h = rt.createElement;
	const Child = ({ id }) =>
		h('b', { 'data-value': id }, rt.use(shape === 'orphan' ? never : second.promise, 'leaf') + id);
	const child = (id) =>
		h(rt.Suspense, { key: id, fallback: h('i', null, 'waiting ' + id) }, h(Child, { id }));
	const Group = ({ id }) => {
		rt.use(first.promise, 'parent');
		return h(
			'section',
			null,
			shape === 'wide' ? Array.from({ length: n }, (_, i) => child(i)) : child(id),
		);
	};
	const parent = (id) =>
		h(rt.Suspense, { key: id, fallback: h('p', null, 'parent ' + id) }, h(Group, { id }));
	const Ready = () => h('strong', { 'data-parent': true }, rt.use(first.promise, 'first'));
	const Barrier = () => h('strong', null, rt.use(first.promise, 'barrier'));
	const App = () =>
		h(
			'main',
			null,
			shape === 'orphan'
				? h(
						rt.Suspense,
						{
							fallback: h(
								'section',
								null,
								Array.from({ length: n }, (_, i) => child(i)),
							),
						},
						h(Ready),
					)
				: shape === 'wide'
					? parent(0)
					: shape === 'flat'
						? [
								h(rt.Suspense, { fallback: h('p', null, 'gate') }, h(Barrier)),
								...Array.from({ length: n }, (_, i) => child(i)),
							]
						: Array.from({ length: n }, (_, i) => parent(i)),
		);
	const start = performance.now();
	rt.renderToPipeableStream(h(App), undefined, {
		timeoutMs: 10000,
		onError: fail,
		onShellError: fail,
	}).pipe({
		write(chunk) {
			Buffer.byteLength(chunk);
			chunks.push(chunk);
			if (chunks.length === 1) {
				releases.push('parent');
				first.resolve(shape === 'orphan' ? 'parent ready' : 'group');
			}
			if (chunks.length === 2 && shape !== 'orphan') {
				releases.push('children');
				second.resolve('row ');
			}
			return true;
		},
		end,
	});
	await done;
	const ms = performance.now() - start;
	const wire = chunks.join('');
	const firstId = wire.match(/data-oct-b="([^"]+)"/);
	assert.ok(firstId);
	const request = firstId[1].slice(0, firstId[1].lastIndexOf('-'));
	const normalized = chunks.map((chunk) => chunk.replaceAll(request, 'STREAM'));
	const semantic = semanticHtmlForVerification('boundary-work', normalized.join(''));
	const rows = [...semantic.matchAll(/<b data-value="(\d+)">row (\d+)<\/b>/g)];
	assert.equal(rows.length, shape === 'orphan' ? 0 : n);
	assert.ok(rows.every((row, i) => row[1] === String(i) && row[2] === String(i)));
	if (shape === 'orphan')
		assert.equal(
			(semantic.match(/<strong data-parent="true">parent ready<\/strong>/g) || []).length,
			1,
		);
	assert.equal(chunks.length, shape === 'orphan' ? 2 : 3);
	assert.deepEqual(releases, shape === 'orphan' ? ['parent'] : ['parent', 'children']);
	return {
		ms,
		normalized,
		semanticSha256: hash(semantic),
		bytes: Buffer.byteLength(wire),
		chunks: chunks.length,
		releases,
	};
}

async function main() {
	const revision = process.argv.find((arg) => arg.startsWith('--octane-revision='))?.split('=')[1];
	const sizes = (process.env.SSR_BOUNDARY_SIZES || '128,512,2048').split(',').map(Number);
	assert.ok(sizes.every((n) => Number.isSafeInteger(n) && n > 0));
	const clean = await buildBoundaryRuntime({ revision }),
		observed = await buildBoundaryRuntime({ revision, observed: true });
	try {
		const targets = [];
		for (const shape of ['wide', 'groups', 'flat', 'orphan'])
			for (const n of sizes) {
				const expected = await renderBoundaryFixture(clean.runtime, n, shape);
				globalThis[counter] = initialBoundaryWork();
				const actual = await renderBoundaryFixture(observed.runtime, n, shape);
				assert.deepEqual(
					actual.normalized,
					expected.normalized,
					'Complete clean/observed wire differs',
				);
				assert.equal(actual.semanticSha256, expected.semanticSha256);
				const work = { ...globalThis[counter] };
				assert.equal(work.full_passes, shape === 'orphan' ? 2 : 3);
				if (shape === 'flat')
					assert.equal(
						work.prune_visits + work.html_queries + work.owner_buckets + work.owner_edges,
						0,
					);
				targets.push({
					name: `boundary-${shape}-${n}`,
					ops: Object.fromEntries(Object.entries(work).map(([key, value]) => [key, stat(value)])),
					meta: {
						n,
						chunks: actual.chunks,
						releases: actual.releases,
						wireSha256: hash(actual.normalized.join('')),
						semanticSha256: actual.semanticSha256,
					},
				});
			}
		const payload = {
			suite: 'ssr-final-replay',
			iterations: 1,
			targets,
			meta: {
				node: process.version,
				v8: process.versions.v8,
				fixtureSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
				clean: clean.metadata,
				observed: observed.metadata,
			},
		};
		console.log(JSON.stringify(payload, null, 2));
		if (process.env.BENCH_JSON)
			fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
	} finally {
		delete globalThis[counter];
		clean.dispose();
		observed.dispose();
	}
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
