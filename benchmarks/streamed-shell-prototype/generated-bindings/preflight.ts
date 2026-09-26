// The build copies literal identity and topology from this view's actual
// compiler descriptor. It never guesses an ID or imports the binding runtime.
import descriptor from 'virtual:automatic-proof';

export function eligible(slot: Element): Element | null {
	const root = slot.firstElementChild;
	const proof = descriptor?.nodes;
	const staticAttributes = descriptor?.staticAttributes;
	if (
		slot.children.length !== 1 ||
		slot.childNodes.length !== 3 ||
		!root ||
		slot.childNodes[0].nodeType !== 8 ||
		slot.childNodes[0].nodeValue !== '[' ||
		slot.childNodes[1] !== root ||
		slot.childNodes[2].nodeType !== 8 ||
		slot.childNodes[2].nodeValue !== ']' ||
		root.getAttribute('data-octane-bindings') !== descriptor.id ||
		!Array.isArray(proof) ||
		!Array.isArray(staticAttributes) ||
		proof.length === 0 ||
		proof.length !== staticAttributes.length
	)
		return null;
	const nodes: Element[] = [];
	const childIndices: number[] = [];
	for (let i = 0; i < proof.length; i++) {
		const [parent, tag, namespace, children, open, text] = proof[i];
		const node =
			i === 0
				? parent === -1
					? root
					: null
				: parent >= 0 && parent < i
					? nodes[parent]?.children[childIndices[parent]++]
					: null;
		if (
			!node ||
			namespace !== 0 ||
			node.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
			node.localName !== tag ||
			open === true ||
			(text
				? node.childNodes.length > 1 || (node.firstChild !== null && node.firstChild.nodeType !== 3)
				: children === null ||
					node.childNodes.length !== children ||
					node.children.length !== children)
		)
			return null;
		const expected = staticAttributes[i] as Array<[string, string]>;
		if (!Array.isArray(expected)) return null;
		for (const [name, value] of expected) if (node.getAttribute(name) !== value) return null;
		if (node.attributes.length !== expected.length + (i === 0 ? 1 : 0)) return null;
		nodes.push(node);
		childIndices.push(0);
	}
	for (let i = 0; i < nodes.length; i++) if (childIndices[i] !== (proof[i][3] ?? 0)) return null;
	return root;
}
