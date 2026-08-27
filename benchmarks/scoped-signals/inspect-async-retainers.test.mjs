import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectAsyncRetainers } from './inspect-async-retainers.mjs';

function fixture(weakAttempt) {
	const strings = [];
	const stringIds = new Map();
	function stringId(value) {
		if (!stringIds.has(value)) {
			stringIds.set(value, strings.length);
			strings.push(value);
		}
		return stringIds.get(value);
	}
	const nodeTypes = ['synthetic', 'object', 'closure', 'hidden', 'string', 'code'];
	const edgeTypes = ['property', 'internal', 'weak'];
	const nodes = [];
	const add = (type, name) => {
		nodes.push({ type, name, edges: [] });
		return nodes.length - 1;
	};
	const link = (from, name, to, type = 'property') => nodes[from].edges.push({ type, name, to });
	const root = add('synthetic', 'root');
	const hole = add('hidden', 'system / Oddball');
	const resolver = add('closure', 'resolve');
	const settled = add('object', 'Promise');
	const attempt = add('object', 'Object');
	const template = add('object', 'Object');
	for (const node of [attempt, template]) {
		for (const name of ['entry', 'controller', 'iterator', 'hasYielded']) link(node, name, hole);
		link(node, 'settled', node === attempt ? settled : hole);
		link(node, 'resolve', node === attempt ? resolver : hole);
	}
	link(root, 'attempt', attempt, weakAttempt ? 'weak' : 'property');
	const allocation = add('code', 'system / AllocationSite');
	link(root, 'allocation', allocation, 'internal');
	link(allocation, 'transition_info', template, 'internal');
	const prototype = add('object', 'Object');
	for (const name of ['scopeKey', 'signal$', 'derived$', 'asyncSignal$', 'dispose'])
		link(prototype, name, resolver);
	const live = add('object', 'minified-name-does-not-matter');
	link(live, '__proto__', prototype);
	link(live, 'key', add('string', 'async-retention/control-live'));
	link(root, 'live', live);
	const weakOwner = add('object', 'minified-name-does-not-matter');
	link(weakOwner, '__proto__', prototype);
	link(weakOwner, 'key', add('string', 'async-retention/promise/1'));
	link(root, 'weak-owner', weakOwner, 'weak');
	const edges = [];
	const values = nodes.flatMap((node) => {
		for (const edge of node.edges)
			edges.push(edgeTypes.indexOf(edge.type), stringId(edge.name), edge.to * 4);
		return [nodeTypes.indexOf(node.type), stringId(node.name), 32, node.edges.length];
	});
	return {
		snapshot: {
			meta: {
				node_fields: ['type', 'name', 'self_size', 'edge_count'],
				node_types: [nodeTypes],
				edge_fields: ['type', 'name_or_index', 'to_node'],
				edge_types: [edgeTypes],
			},
		},
		nodes: values,
		edges,
		strings,
	};
}

for (const weakAttempt of [false, true]) {
	test(`retainer scanner excludes weak edges and allocation templates (weak attempt=${weakAttempt})`, (context) => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-retainer-scanner-test-'));
		context.after(() => fs.rmSync(directory, { force: true, recursive: true }));
		const filename = path.join(directory, 'fixture.heapsnapshot');
		fs.writeFileSync(filename, JSON.stringify(fixture(weakAttempt)));
		const result = inspectAsyncRetainers(filename);
		assert.equal(result.strongScopeCount, 1);
		assert.equal(result.scopeSamples[0].scopeKey, 'async-retention/control-live');
		assert.equal(result.retiredCycleScopeCount, 0);
		assert.equal(result.retainedAttemptRecords, weakAttempt ? 0 : 1);
		assert.equal(result.revokedAttemptRecords, weakAttempt ? 0 : 1);
		assert.equal(result.attemptAllocationTemplates, 1);
		assert.equal(result.revokedAttemptsWithObjectEntry, 0);
	});
}
