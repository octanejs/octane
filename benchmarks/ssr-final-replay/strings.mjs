// Standalone V8 representation evidence. Heap snapshots and UTF-8 encoding are
// deliberately outside every timing claim and are never run by the CI suite.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeHeapSnapshot } from 'node:v8';
import { build } from 'esbuild';

const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(process.env.SSR_SOURCE_ROOT || repo);
const runtimePath = path.join(sourceRoot, 'packages/octane/src/runtime.server.ts');
const source = fs.readFileSync(runtimePath, 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-rope-'));
const records = [];
function inspect(label, body) {
	globalThis.__finalSSRRope = { auditRope: body };
	const file = path.join(temp, label + '.heapsnapshot');
	writeHeapSnapshot(file);
	const heap = JSON.parse(fs.readFileSync(file, 'utf8'));
	fs.unlinkSync(file);
	const { nodes, edges, strings } = heap;
	const fields = heap.snapshot.meta;
	const ns = fields.node_fields.length,
		es = fields.edge_fields.length;
	const nt = fields.node_fields.indexOf('type'),
		nn = fields.node_fields.indexOf('name');
	const ne = fields.node_fields.indexOf('edge_count');
	const et = fields.edge_fields.indexOf('type'),
		en = fields.edge_fields.indexOf('name_or_index');
	const to = fields.edge_fields.indexOf('to_node');
	const starts = new Map();
	let cursor = 0,
		root,
		holder;
	for (let node = 0; node < nodes.length; node += ns) {
		starts.set(node, cursor);
		for (let end = cursor + nodes[node + ne] * es; cursor < end; cursor += es) {
			if (
				fields.edge_types[et][edges[cursor + et]] === 'property' &&
				strings[edges[cursor + en]] === '__finalSSRRope' &&
				fields.node_types[nt][nodes[edges[cursor + to] + nt]] === 'object'
			)
				holder = edges[cursor + to];
		}
	}
	assert.notEqual(holder, undefined, 'heap snapshot identifies the observed holder');
	for (let i = starts.get(holder), end = i + nodes[holder + ne] * es; i < end; i += es)
		if (
			fields.edge_types[et][edges[i + et]] === 'property' &&
			strings[edges[i + en]] === 'auditRope'
		)
			root = edges[i + to];
	assert.notEqual(root, undefined, 'heap snapshot identifies the observed response');
	const seen = new Set(),
		stack = [root],
		result = { label, utf16Length: body.length, cons: 0, sequential: 0, other: 0 };
	while (stack.length) {
		const node = stack.pop();
		if (seen.has(node)) continue;
		seen.add(node);
		const type = fields.node_types[nt][nodes[node + nt]];
		if (type === 'concatenated string') result.cons++;
		else if (type === 'string') result.sequential++;
		else result.other++;
		for (let i = starts.get(node), end = i + nodes[node + ne] * es; i < end; i += es) {
			const name = strings[edges[i + en]];
			if (
				fields.edge_types[et][edges[i + et]] === 'internal' &&
				(name === 'first' || name === 'second' || name === 'parent')
			)
				stack.push(edges[i + to]);
		}
	}
	assert.ok(
		result.cons + result.sequential > 0,
		JSON.stringify({
			...result,
			rootType: fields.node_types[nt][nodes[root + nt]],
			rootName: strings[nodes[root + nn]],
		}),
	);
	records.push(result);
}
try {
	const marker = 'function isDocumentRoot(body: string): boolean {';
	assert.equal(source.split(marker).length, 2);
	const observed =
		source.replace(marker, 'function classifyDocumentRoot(body: string): boolean {') +
		`
function isDocumentRoot(body: string): boolean {
 globalThis.__inspectDocumentRope?.('before', body);
 const result=classifyDocumentRoot(body);
 globalThis.__inspectDocumentRope?.('after', body);
 return result;
}
`;
	const options = {
		stdin: {
			contents: `export {createElement, renderToPipeableStream, renderToReadableStream} from ${JSON.stringify(runtimePath)};`,
			resolveDir: repo,
		},
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'node',
		define: { 'process.env.NODE_ENV': '"production"' },
		nodePaths: [path.join(repo, 'packages/octane/node_modules'), path.join(repo, 'node_modules')],
	};
	const cleanText = (await build(options)).outputFiles[0].text;
	const observedText = (
		await build({
			...options,
			plugins: [
				{
					name: 'rope-observer',
					setup(builder) {
						builder.onLoad({ filter: /runtime\.server\.ts$/ }, () => ({
							contents: observed,
							loader: 'ts',
							resolveDir: path.dirname(runtimePath),
						}));
					},
				},
			],
		})
	).outputFiles[0].text;
	fs.writeFileSync(path.join(temp, 'clean.mjs'), cleanText);
	fs.writeFileSync(path.join(temp, 'observed.mjs'), observedText);
	const clean = await import(pathToFileURL(path.join(temp, 'clean.mjs')));
	const rt = await import(pathToFileURL(path.join(temp, 'observed.mjs')));
	const tree = (runtime) =>
		runtime.createElement(
			'html',
			null,
			runtime.createElement('head'),
			runtime.createElement(
				'body',
				null,
				...Array.from({ length: 128 }, (_, i) =>
					runtime.createElement(
						'p',
						{ 'data-row': i },
						'row-' + i + ' ☃ ' + 'value & more '.repeat(32),
					),
				),
			),
		);
	let prefixSeen = false;
	globalThis.__inspectDocumentRope = (phase, body) => {
		if (prefixSeen) return;
		inspect('predicate-' + phase, body);
		if (phase === 'before') inspect('predicate-observer-control', body);
		else prefixSeen = true;
	};
	let wire = '';
	await new Promise((resolve, reject) =>
		rt.renderToPipeableStream(tree(rt), { onError: reject, onShellError: reject }).pipe({
			write(chunk) {
				inspect('writer-before-encoding', chunk);
				const bytes = Buffer.from(chunk);
				inspect('writer-after-encoding', chunk);
				wire += bytes.toString();
				return true;
			},
			end: resolve,
		}),
	);
	delete globalThis.__inspectDocumentRope;
	const expected = await new Response(await clean.renderToReadableStream(tree(clean))).text();
	assert.equal(
		wire,
		expected,
		'Node transport encoding and Web TextEncoder deliver identical complete bytes',
	);
	assert.ok(wire.startsWith('<!DOCTYPE html>'));
	assert.equal((wire.match(/data-row=/g) || []).length, 128);
	assert.ok(wire.includes('☃') && wire.includes('&amp;'));
	assert.deepEqual(
		{ ...records[0], label: '' },
		{ ...records[1], label: '' },
		'heap observation itself does not flatten the rope',
	);
	const result = {
		suite: 'ssr-output-strings',
		node: process.version,
		v8: process.versions.v8,
		sourceHash: hash(source),
		bundleHash: hash(cleanText),
		wireBytes: Buffer.byteLength(wire),
		wireHash: hash(wire),
		records,
	};
	console.log(JSON.stringify(result, null, 2));
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
} finally {
	delete globalThis.__finalSSRRope;
	delete globalThis.__inspectDocumentRope;
	fs.rmSync(temp, { recursive: true, force: true });
}
