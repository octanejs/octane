/**
 * Move native presentation without detaching the node that owns active editing.
 * Both the general renderer and renderer-free keyed views use this leaf; callers
 * retain their own focus/selection capture and commit lifetime.
 */
export function moveNativeNodeBefore(
	parent: Node,
	node: Node,
	anchor: Node | null,
	focused: Element | null,
	contentEditable: boolean,
): void {
	if (
		focused === null ||
		(node !== focused && (node.nodeType !== 1 || !(node as Element).contains(focused)))
	) {
		parent.insertBefore(node, anchor);
		return;
	}

	const moveBefore = (parent as Node & { moveBefore?: (node: Node, anchor: Node | null) => void })
		.moveBefore;
	// A state-preserving move keeps native input composition alive, but Chromium
	// still collapses live Range selections inside a moved content-editable tree.
	if (!contentEditable && typeof moveBefore === 'function') {
		moveBefore.call(parent, node, anchor);
		return;
	}

	// insertBefore detaches an existing node, which can end a trusted keyboard
	// composition even if focus is restored afterward. Keep the editing subtree
	// connected by rotating only its intervening siblings around it.
	if (node === anchor || node.nextSibling === anchor) return;
	if (
		anchor === null ||
		(node.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
	) {
		let cursor = node.nextSibling;
		while (cursor !== anchor) {
			const next = cursor!.nextSibling;
			parent.insertBefore(cursor!, node);
			cursor = next;
		}
	} else {
		const end = node.nextSibling;
		let cursor: Node | null = anchor;
		while (cursor !== node) {
			const next: Node | null = cursor!.nextSibling;
			parent.insertBefore(cursor!, end);
			cursor = next;
		}
	}
}
