/**
 * Move native presentation without detaching active editing when possible.
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
	let containsFocused = node === focused;
	if (!containsFocused && focused !== null && node.nodeType === 1) {
		let candidate: Element | undefined = focused;
		do {
			if ((node as Element).contains(candidate)) {
				containsFocused = true;
				break;
			}
			// Native contains() stops at a shadow root. Its host remains part of
			// the editing subtree, including across nested or closed shadow roots.
			candidate = (candidate.getRootNode() as ShadowRoot).host;
		} while (candidate !== undefined);
	}
	if (!containsFocused) {
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

	// Rotation requires siblings in one parent. Cross-parent moves must insert
	// the editing node itself; let native insertion validate foreign anchors.
	if (node.parentNode !== parent || (anchor !== null && anchor.parentNode !== parent)) {
		parent.insertBefore(node, anchor);
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
