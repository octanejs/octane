import './_setup';
import { expect } from 'vitest';

// OCTANE DIVERGENCE[dom-markers]: octane delimits dynamic ranges with comment
// markers React never emits (`<!--it-->` pairs and their siblings). Strip only
// that renderer-marker vocabulary from serialized DOM snapshots; real comment
// nodes and element structure still compare exactly.
const MARKER_NAMES = new Set([
	'',
	'it',
	'comp',
	'frag',
	'wip',
	'hmr',
	'hydrate',
	'portal',
	'for',
	'try',
	'try-b',
	'pend-b',
	'catch-b',
	'activity',
	'passthrough-try',
	'root',
]);
const SHOW_COMMENT = 128;
const STRIPPED = new WeakSet<Node>();

function isMarkerComment(node: Comment): boolean {
	const data = node.data;
	return MARKER_NAMES.has(data.startsWith('/') ? data.slice(1) : data);
}

function stripMarkerComments(root: Node): void {
	const walker = root.ownerDocument!.createTreeWalker(root, SHOW_COMMENT);
	const markers: Comment[] = [];
	let node = walker.nextNode();
	while (node) {
		if (isMarkerComment(node as Comment)) markers.push(node as Comment);
		node = walker.nextNode();
	}
	markers.forEach((marker) => marker.remove());
}

expect.addSnapshotSerializer({
	test: (value) =>
		value != null &&
		typeof value === 'object' &&
		(value as Node).nodeType === 1 &&
		!STRIPPED.has(value as Node),
	serialize(value, config, indentation, depth, refs, printer) {
		const clone = (value as Element).cloneNode(true) as Element;
		stripMarkerComments(clone);
		STRIPPED.add(clone);
		clone.querySelectorAll('*').forEach((el) => STRIPPED.add(el));
		return printer(clone, config, indentation, depth, refs);
	},
});
