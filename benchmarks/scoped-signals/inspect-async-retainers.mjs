import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sha256 } from './bundle-boundaries.mjs';
import { traceHeapReachability } from './heap-reachability.mjs';

// The graph traversal is extracted from the earlier synchronous retainer
// diagnostic. It runs only after the measured worker has exited. Raw heap
// strings never become report content; only known workload labels are emitted.
export function inspectAsyncRetainers(
	filename,
	{ liveScopeKeys = ['async-retention/control-live'] } = {},
) {
	const contents = fs.readFileSync(filename);
	const heap = JSON.parse(contents);
	const meta = heap.snapshot.meta;
	const nodeWidth = meta.node_fields.length;
	const edgeWidth = meta.edge_fields.length;
	const n = Object.fromEntries(meta.node_fields.map((name, index) => [name, index]));
	const e = Object.fromEntries(meta.edge_fields.map((name, index) => [name, index]));
	const nodeTypes = meta.node_types[n.type];
	const edgeTypes = meta.edge_types[e.type];
	const nodeCount = heap.nodes.length / nodeWidth;
	const { edgeStarts, parent, parentEdge, ephemeronPairCount, ephemeronPromotions } =
		traceHeapReachability(heap);
	const liveScopes = new Set(liveScopeKeys);
	const target = (edge) => heap.edges[edge + e.to_node] / nodeWidth;
	const edgeType = (edge) => edgeTypes[heap.edges[edge + e.type]];
	const edgeName = (edge) => heap.strings[heap.edges[edge + e.name_or_index]];
	const nodeType = (node) => nodeTypes[heap.nodes[node * nodeWidth + n.type]];
	const nodeName = (node) => heap.strings[heap.nodes[node * nodeWidth + n.name]];
	const selfBytes = (node) => heap.nodes[node * nodeWidth + n.self_size];
	function namedEdge(node, name, type = 'property') {
		for (let edge = edgeStarts[node]; edge < edgeStarts[node + 1]; edge += edgeWidth) {
			if (edgeType(edge) === type && edgeName(edge) === name) return target(edge);
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
	const hasProperties = (node, names) => names.every((name) => namedEdge(node, name) !== undefined);
	const prototypes = { scope: new Set(), signal: new Set(), request: new Set() };
	for (let node = 0; node < nodeCount; node++) {
		if (nodeType(node) !== 'object') continue;
		if (hasProperties(node, ['scopeKey', 'signal$', 'derived$', 'asyncSignal$', 'dispose']))
			prototypes.scope.add(node);
		if (hasProperties(node, ['get', 'latest', 'snapshot', 'subscribe', 'retry']))
			prototypes.signal.add(node);
		if (hasProperties(node, ['start', 'deliver', 'stopAttempt', 'remove', 'active']))
			prototypes.request.add(node);
	}
	function rootPath(node) {
		const result = [];
		for (let current = node; current !== 0; current = parent[current]) {
			const edge = parentEdge[current];
			const type = nodeType(current);
			result.push({
				edge: ['element', 'hidden'].includes(edgeType(edge))
					? String(heap.edges[edge + e.name_or_index])
					: edgeName(edge).slice(0, 100),
				type,
				name: type.includes('string')
					? '(string contents omitted)'
					: nodeName(current).slice(0, 100),
			});
		}
		return result.reverse();
	}
	const scopes = new Map();
	const signals = [];
	const requests = [];
	const attempts = [];
	let attemptAllocationTemplates = 0;
	const producers = new Map();
	const iterators = [];
	for (let node = 0; node < nodeCount; node++) {
		if (parent[node] === -1 || nodeType(node) !== 'object') continue;
		const prototype = namedEdge(node, '__proto__');
		if (prototypes.scope.has(prototype)) {
			// ScopeImpl's public getter returns key in this hashed source revision.
			// This private storage is an offline label, not a public-state test oracle.
			scopes.set(node, stringValue(namedEdge(node, 'key')));
		}
		if (prototypes.signal.has(prototype)) signals.push(node);
		if (prototypes.request.has(prototype)) requests.push(node);
		if (
			hasProperties(node, ['entry', 'controller', 'iterator', 'settled', 'resolve', 'hasYielded'])
		) {
			const settled = namedEdge(node, 'settled');
			const resolve = namedEdge(node, 'resolve');
			// V8's AllocationSite may retain an object-literal template with the
			// same property names. Actual attempts always own a real settled
			// Promise and resolver closure; a template contains placeholder holes.
			if (
				nodeType(settled) === 'object' &&
				nodeName(settled) === 'Promise' &&
				nodeType(resolve) === 'closure'
			)
				attempts.push(node);
			else attemptAllocationTemplates++;
		}
		const kind = stringValue(namedEdge(node, 'octaneRetentionProducerKind'));
		if (kind !== null)
			producers.set(node, { kind, origin: stringValue(namedEdge(node, 'octaneRetentionOrigin')) });
		if (namedEdge(node, 'octaneRetentionIterator') !== undefined) iterators.push(node);
	}
	function sample(node) {
		return { className: nodeName(node), selfBytes: selfBytes(node), rootPath: rootPath(node) };
	}
	function producerOnPath(node) {
		for (let current = node; current !== 0; current = parent[current]) {
			if (producers.has(current)) return producers.get(current);
		}
		return null;
	}
	const owned = (nodes) =>
		nodes.map((node) => ({
			node,
			scopeKey: scopes.get(namedEdge(node, 'owner')) ?? null,
		}));
	const signalOwners = owned(signals);
	const requestOwners = owned(requests);
	const requestSet = new Set(requests);
	const activeAttempts = attempts.filter((node) => requestSet.has(namedEdge(node, 'entry')));
	const revokedAttempts = attempts.filter((node) => !requestSet.has(namedEdge(node, 'entry')));
	const objectProperty = (node, name) => {
		const value = namedEdge(node, name);
		return value !== undefined && nodeType(value) === 'object';
	};
	const scopeRows = [...scopes].map(([node, scopeKey]) => ({ scopeKey, ...sample(node) }));
	const retiredScopes = scopeRows.filter((scope) => !liveScopes.has(scope.scopeKey));
	const producerCounts = { promise: 0, 'stream-next': 0, 'stream-return': 0 };
	for (const { kind } of producers.values()) {
		assert.ok(Object.hasOwn(producerCounts, kind), `Unknown producer marker: ${kind}`);
		producerCounts[kind]++;
	}
	return {
		snapshotSha256: sha256(contents),
		snapshotBytes: contents.length,
		ephemeronPairCount,
		ephemeronPromotions,
		strongScopeCount: scopes.size,
		retiredCycleScopeCount: retiredScopes.length,
		scopeSamples: scopeRows.slice(0, 8),
		retiredCycleScopeSamples: retiredScopes.slice(0, 8),
		strongSignalCount: signals.length,
		retiredCycleSignalCount: signalOwners.filter((entry) => !liveScopes.has(entry.scopeKey)).length,
		signalSamples: signalOwners
			.slice(0, 8)
			.map(({ node, scopeKey }) => ({ scopeKey, ...sample(node) })),
		strongRequestCount: requests.length,
		retiredCycleRequestCount: requestOwners.filter((entry) => !liveScopes.has(entry.scopeKey))
			.length,
		requestSamples: requestOwners
			.slice(0, 5)
			.map(({ node, scopeKey }) => ({ scopeKey, ...sample(node) })),
		retainedAttemptRecords: attempts.length,
		attemptAllocationTemplates,
		activeAttemptRecords: activeAttempts.length,
		revokedAttemptRecords: revokedAttempts.length,
		revokedAttemptsWithObjectEntry: revokedAttempts.filter((node) => objectProperty(node, 'entry'))
			.length,
		revokedAttemptsWithController: revokedAttempts.filter((node) =>
			objectProperty(node, 'controller'),
		).length,
		revokedAttemptsWithIterator: revokedAttempts.filter((node) => objectProperty(node, 'iterator'))
			.length,
		revokedAttemptSamples: revokedAttempts
			.slice(0, 3)
			.map((node) => ({ retainedByProducer: producerOnPath(node), ...sample(node) })),
		externalProducerCounts: producerCounts,
		externalProducerSamples: Object.keys(producerCounts)
			.map((kind) => [...producers].find(([, data]) => data.kind === kind))
			.filter(Boolean)
			.map(([node, data]) => ({ ...data, ...sample(node) })),
		strongStreamIteratorCount: iterators.length,
		streamIteratorSamples: iterators.slice(0, 3).map((node) => ({
			origin: stringValue(namedEdge(node, 'octaneRetentionIterator')),
			...sample(node),
		})),
	};
}
