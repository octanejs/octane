import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const reportPath = path.join(import.meta.dirname, 'engine-retainers.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
assert.equal(report.environment.mode, 'heap-diagnostics');
assert.equal(report.failed, undefined);

function inspect(file) {
	const text = fs.readFileSync(file, 'utf8');
	const heap = JSON.parse(text);
	const metadata = heap.snapshot.meta;
	const nodeFields = metadata.node_fields;
	const edgeFields = metadata.edge_fields;
	const nodeWidth = nodeFields.length;
	const edgeWidth = edgeFields.length;
	const n = Object.fromEntries(nodeFields.map((name, index) => [name, index]));
	const e = Object.fromEntries(edgeFields.map((name, index) => [name, index]));
	const nodeTypes = metadata.node_types[n.type];
	const edgeTypes = metadata.edge_types[e.type];
	const nodeCount = heap.nodes.length / nodeWidth;
	const edgeStarts = new Uint32Array(nodeCount + 1);
	for (let node = 0; node < nodeCount; node++) {
		edgeStarts[node + 1] =
			edgeStarts[node] + heap.nodes[node * nodeWidth + n.edge_count] * edgeWidth;
	}
	assert.equal(edgeStarts[nodeCount], heap.edges.length);
	const target = (edge) => heap.edges[edge + e.to_node] / nodeWidth;
	const edgeType = (edge) => edgeTypes[heap.edges[edge + e.type]];
	const edgeName = (edge) => heap.strings[heap.edges[edge + e.name_or_index]];
	const nodeType = (node) => nodeTypes[heap.nodes[node * nodeWidth + n.type]];
	const nodeName = (node) => heap.strings[heap.nodes[node * nodeWidth + n.name]];
	function namedEdge(node, name, type) {
		for (let edge = edgeStarts[node]; edge < edgeStarts[node + 1]; edge += edgeWidth) {
			if (edgeName(edge) === name && (type === undefined || edgeType(edge) === type))
				return target(edge);
		}
		return undefined;
	}
	function stringValue(node, depth = 0) {
		if (node === undefined || depth > 100) return null;
		const type = nodeType(node);
		if (type === 'string') return nodeName(node);
		if (type !== 'concatenated string') return null;
		const first = stringValue(namedEdge(node, 'first', 'internal'), depth + 1);
		const second = stringValue(namedEdge(node, 'second', 'internal'), depth + 1);
		return first === null || second === null ? null : first + second;
	}

	// Identify data owners by their public prototype surface, not a minified class name.
	const prototypes = new Set();
	for (let node = 0; node < nodeCount; node++) {
		if (nodeType(node) !== 'object') continue;
		if (
			['scopeKey', 'signal$', 'derived$', 'asyncSignal$', 'dispose'].every(
				(name) => namedEdge(node, name, 'property') !== undefined,
			)
		)
			prototypes.add(node);
	}

	// A weak snapshot edge is not a strong retainer. Record a shortest strong root path.
	const parent = new Int32Array(nodeCount).fill(-1);
	const parentEdge = new Int32Array(nodeCount).fill(-1);
	const queue = new Uint32Array(nodeCount);
	let head = 0;
	let tail = 1;
	parent[0] = 0;
	while (head < tail) {
		const node = queue[head++];
		for (let edge = edgeStarts[node]; edge < edgeStarts[node + 1]; edge += edgeWidth) {
			if (edgeType(edge) === 'weak') continue;
			const next = target(edge);
			if (parent[next] !== -1) continue;
			parent[next] = node;
			parentEdge[next] = edge;
			queue[tail++] = next;
		}
	}
	function rootPath(node) {
		const result = [];
		for (let current = node; current !== 0; current = parent[current]) {
			const edge = parentEdge[current];
			const type = nodeType(current);
			result.push({
				edge: ['element', 'hidden'].includes(edgeType(edge))
					? String(heap.edges[edge + e.name_or_index])
					: edgeName(edge).slice(0, 80),
				type,
				name: type.includes('string')
					? '(string contents omitted)'
					: nodeName(current).slice(0, 80),
			});
		}
		return result.reverse();
	}
	const scopes = [];
	for (let node = 0; node < nodeCount; node++) {
		if (!prototypes.has(namedEdge(node, '__proto__', 'property')) || parent[node] === -1) continue;
		// In this recorded source revision, ScopeImpl's public scopeKey getter returns key.
		// This is offline retainer inspection; no implementation field is a correctness oracle.
		const scopeKey = stringValue(namedEdge(node, 'key', 'property'));
		scopes.push({
			scopeKey,
			className: nodeName(node),
			selfBytes: heap.nodes[node * nodeWidth + n.self_size],
			rootPath: rootPath(node),
		});
	}
	return {
		snapshot: file,
		snapshotSha256: createHash('sha256').update(text).digest('hex'),
		scopes,
	};
}

const rows = report.targets
	.filter((row) => row.name.startsWith('octane-scoped-'))
	.flatMap((row) =>
		row.meta.checkpoints.map((checkpoint) => ({
			name: row.name,
			cycle: checkpoint.cycle,
			phase: checkpoint.phase ?? 'active',
			disposedOwners: checkpoint.disposedOwners ?? row.meta.cycles * 2,
			...inspect(checkpoint.snapshot),
		})),
	);
assert.ok(
	rows.some(
		(row) => row.cycle === 0 && row.scopes.some((scope) => scope.scopeKey?.endsWith('/shared')),
	),
	'The active positive-control owner was not detected; do not interpret zero counts.',
);
const output = {
	mode: 'offline-v8-retainer-diagnostics',
	scopedBundleSha256: report.environment.builds.scoped.sha256,
	method:
		'Scope instances identified by public prototype methods; strong paths exclude weak edges. Stored key discriminates the known workload owners in this recorded engine revision.',
	limitations:
		'One synchronous ownership workload. These snapshots do not establish async producer, DOM, native block, historical frame, or DevTools retention behavior.',
	rows,
};
fs.writeFileSync(
	path.join(import.meta.dirname, 'engine-retainer-analysis.json'),
	`${JSON.stringify(output, null, '\t')}\n`,
);
for (const row of rows)
	console.log(
		`${row.phase} cycle ${row.cycle}: ${row.scopes.length} strongly retained scope(s); ${JSON.stringify(row.scopes.map((scope) => scope.scopeKey))}`,
	);
