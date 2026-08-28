import assert from 'node:assert/strict';

// V8 exposes WeakMap ephemerons as synthetic internal edges from both the key
// and its table. Either edge alone is insufficient: the table AND key must be
// reachable before the value becomes reachable. Raw weak edges never qualify.
export function traceHeapReachability(heap) {
	const meta = heap.snapshot.meta;
	const nodeWidth = meta.node_fields.length;
	const edgeWidth = meta.edge_fields.length;
	const n = Object.fromEntries(meta.node_fields.map((name, index) => [name, index]));
	const e = Object.fromEntries(meta.edge_fields.map((name, index) => [name, index]));
	const edgeTypes = meta.edge_types[e.type];
	const nodeCount = heap.nodes.length / nodeWidth;
	const edgeStarts = new Uint32Array(nodeCount + 1);
	const conditionalEdges = new Set();
	const pairs = new Map();
	const wantedIds = new Set();
	for (let node = 0; node < nodeCount; node++) {
		edgeStarts[node + 1] =
			edgeStarts[node] + heap.nodes[node * nodeWidth + n.edge_count] * edgeWidth;
		for (let edge = edgeStarts[node]; edge < edgeStarts[node + 1]; edge += edgeWidth) {
			if (edgeTypes[heap.edges[edge + e.type]] !== 'internal') continue;
			const name = heap.strings[heap.edges[edge + e.name_or_index]];
			if (!name.includes(' / part of key (')) continue;
			const match =
				/^\d+ \/ part of key \(.* @([0-9]+)\) -> value \(.* @([0-9]+)\) pair in WeakMap \(table @([0-9]+)\)$/.exec(
					name,
				);
			assert.ok(match, 'Unsupported V8 WeakMap ephemeron metadata');
			assert.notEqual(n.id, undefined, 'V8 ephemerons require stable node IDs');
			const keyId = Number(match[1]);
			const valueId = Number(match[2]);
			const tableId = Number(match[3]);
			for (const id of [keyId, valueId, tableId]) wantedIds.add(id);
			const identity = `${keyId}/${tableId}/${valueId}`;
			let pair = pairs.get(identity);
			if (!pair) pairs.set(identity, (pair = { keyId, valueId, tableId, edges: [] }));
			pair.edges.push({ node, edge });
			conditionalEdges.add(edge);
		}
	}
	assert.equal(edgeStarts[nodeCount], heap.edges.length, 'Malformed V8 edge table');
	const ids = new Map();
	if (wantedIds.size > 0) {
		for (let node = 0; node < nodeCount; node++) {
			const id = heap.nodes[node * nodeWidth + n.id];
			if (wantedIds.has(id)) ids.set(id, node);
		}
	}
	const ephemerons = [...pairs.values()].map((pair) => {
		const key = ids.get(pair.keyId);
		const value = ids.get(pair.valueId);
		const table = ids.get(pair.tableId);
		assert.ok(
			key !== undefined && value !== undefined && table !== undefined,
			'Missing V8 ephemeron node',
		);
		const link =
			pair.edges.find(({ node }) => node === key) ?? pair.edges.find(({ node }) => node === table);
		assert.ok(link, 'Missing V8 ephemeron edge');
		assert.equal(heap.edges[link.edge + e.to_node] / nodeWidth, value);
		return { key, value, table, ...link };
	});
	const parent = new Int32Array(nodeCount).fill(-1);
	const parentEdge = new Int32Array(nodeCount).fill(-1);
	const queue = new Uint32Array(nodeCount);
	let head = 0;
	let tail = 1;
	let ephemeronPromotions = 0;
	parent[0] = 0;
	for (;;) {
		while (head < tail) {
			const node = queue[head++];
			for (let edge = edgeStarts[node]; edge < edgeStarts[node + 1]; edge += edgeWidth) {
				if (edgeTypes[heap.edges[edge + e.type]] === 'weak' || conditionalEdges.has(edge)) continue;
				const next = heap.edges[edge + e.to_node] / nodeWidth;
				if (parent[next] !== -1) continue;
				parent[next] = node;
				parentEdge[next] = edge;
				queue[tail++] = next;
			}
		}
		for (const pair of ephemerons) {
			if (parent[pair.value] !== -1 || parent[pair.key] === -1 || parent[pair.table] === -1)
				continue;
			parent[pair.value] = pair.node;
			parentEdge[pair.value] = pair.edge;
			queue[tail++] = pair.value;
			ephemeronPromotions++;
		}
		if (head === tail) break;
	}
	return {
		edgeStarts,
		parent,
		parentEdge,
		ephemeronPairCount: ephemerons.length,
		ephemeronPromotions,
	};
}
