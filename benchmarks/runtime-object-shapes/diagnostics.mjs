import assert from 'node:assert/strict';
import { getHeapSnapshot } from 'node:v8';

/** Untimed V8 map groups and shallow record/property-array bytes.
 * Run Node with --allow-natives-syntax --expose-gc. Records remain unmodified;
 * closures, nested values, scopes and DOM retained by them are not attributed.
 */
export async function inspectRecords(records, families) {
	const sameMap = new Function('left', 'right', 'return %HaveSameMap(left, right)');
	const maps = {};
	for (const [family, names] of Object.entries(families)) {
		const groups = [];
		for (const name of names) {
			const group = groups.find((members) => sameMap(records[name], records[members[0]]));
			if (group) group.push(name);
			else groups.push([name]);
		}
		maps[family] = groups;
	}
	globalThis.__octaneObjectShapeRecords = records;
	try {
		globalThis.gc();
		const chunks = [];
		for await (const chunk of getHeapSnapshot()) chunks.push(chunk);
		const snapshot = JSON.parse(Buffer.concat(chunks).toString());
		const { nodes, edges, strings } = snapshot;
		const meta = snapshot.snapshot.meta;
		const width = meta.node_fields.length;
		const edgeWidth = meta.edge_fields.length;
		const edgeCount = meta.node_fields.indexOf('edge_count');
		const size = meta.node_fields.indexOf('self_size');
		const edgeType = meta.edge_fields.indexOf('type');
		const edgeName = meta.edge_fields.indexOf('name_or_index');
		const edgeTarget = meta.edge_fields.indexOf('to_node');
		const property = meta.edge_types[edgeType].indexOf('property');
		const internal = meta.edge_types[edgeType].indexOf('internal');
		const offsets = new Map();
		let recordNode;
		for (let node = 0, edge = 0; node < nodes.length; node += width) {
			offsets.set(node, edge);
			for (let count = nodes[node + edgeCount]; count > 0; count--, edge += edgeWidth) {
				if (
					edges[edge + edgeType] === property &&
					strings[edges[edge + edgeName]] === '__octaneObjectShapeRecords'
				)
					recordNode = edges[edge + edgeTarget];
			}
		}
		assert.notEqual(
			recordNode,
			undefined,
			'Retained hook record directory missing from heap snapshot',
		);
		const sizes = {};
		for (
			let edge = offsets.get(recordNode), count = nodes[recordNode + edgeCount];
			count > 0;
			count--, edge += edgeWidth
		) {
			if (edges[edge + edgeType] !== property) continue;
			const name = strings[edges[edge + edgeName]];
			if (!(name in records)) continue;
			const node = edges[edge + edgeTarget];
			let backingPropertiesBytes = 0;
			for (
				let childEdge = offsets.get(node), children = nodes[node + edgeCount];
				children > 0;
				children--, childEdge += edgeWidth
			) {
				if (
					edges[childEdge + edgeType] === internal &&
					strings[edges[childEdge + edgeName]] === 'properties'
				)
					backingPropertiesBytes = nodes[edges[childEdge + edgeTarget] + size];
			}
			sizes[name] = {
				fields: Object.keys(records[name]),
				shallowBytes: nodes[node + size],
				backingPropertiesBytes,
				recordAndPropertiesBytes: nodes[node + size] + backingPropertiesBytes,
			};
		}
		assert.equal(Object.keys(sizes).length, Object.keys(records).length);
		return { maps, records: sizes };
	} finally {
		delete globalThis.__octaneObjectShapeRecords;
	}
}
