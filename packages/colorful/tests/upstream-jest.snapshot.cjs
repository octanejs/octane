// Upstream snapshots predate React serializing the alpha-gradient inline style that
// the vendored Alpha.tsx always sets. Strip that attribute so the byte-exact suite
// stays green on modern React without editing vendored snapshot bytes.
const stripping = new WeakSet();

expect.addSnapshotSerializer({
	test: function test(value) {
		return Boolean(
			value &&
			value.nodeType === 1 &&
			typeof value.cloneNode === 'function' &&
			!stripping.has(value),
		);
	},
	serialize: function serialize(value, config, indentation, depth, refs, printer) {
		const clone = value.cloneNode(true);
		const gradients = clone.querySelectorAll
			? clone.querySelectorAll('.react-colorful__alpha-gradient')
			: [];
		for (const node of gradients) node.removeAttribute('style');
		stripping.add(clone);
		try {
			return printer(clone, config, indentation, depth, refs);
		} finally {
			stripping.delete(clone);
		}
	},
});
