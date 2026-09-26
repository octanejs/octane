// The benchmark host exclusively owns this one-shot slot; no parent renderer
// may subsequently hydrate, reconcile or remount it. Transfer just the exact
// server slot markers, never an unknown boundary or a nested comment range.
export function transfer(slot: Element): Element | null {
	if (slot.childNodes.length !== 3) return null;
	const [open, root, close] = slot.childNodes;
	if (
		open.nodeType !== 8 ||
		open.nodeValue !== '[' ||
		root.nodeType !== 1 ||
		(root as Element).localName !== 'section' ||
		(root as Element).id !== 'automatic-status' ||
		close.nodeType !== 8 ||
		close.nodeValue !== ']' ||
		slot.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT).nextNode()
	)
		return null;
	slot.removeChild(open);
	slot.removeChild(close);
	return root as Element;
}
