/**
 * Move native presentation without resetting its live state when possible.
 * Keyed, descriptor, and binding reconciliation all move through this leaf;
 * callers retain their own focus/selection capture and commit lifetime.
 */
export function moveNativeNodeBefore(
	parent: Node,
	node: Node,
	anchor: Node | null,
	focused: Element | null,
	contentEditable: boolean,
): void {
	// A state-preserving move keeps iframes loaded, animations running, open
	// popovers shown, and native input focus and composition alive.
	// It requires connected nodes in the same document, so fresh or detached
	// nodes take insertBefore. Chromium still collapses live Range selections
	// inside a moved content-editable tree, so that tree is rotated instead.
	const move = nativeMove(parent);
	if (
		move !== null &&
		node.isConnected === true &&
		parent.ownerDocument === node.ownerDocument &&
		!(contentEditable && containsFocus(node, focused))
	) {
		move.call(parent, node, anchor);
		return;
	}
	if (!containsFocus(node, focused)) {
		parent.insertBefore(node, anchor);
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
	// connected by rotating only its intervening siblings around it. Those
	// siblings are children of the parent, so they move natively when it can.
	const rotate = move ?? parent.insertBefore;
	if (node === anchor || node.nextSibling === anchor) return;
	if (
		anchor === null ||
		(node.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
	) {
		let cursor = node.nextSibling;
		while (cursor !== anchor) {
			const next = cursor!.nextSibling;
			rotate.call(parent, cursor!, node);
			cursor = next;
		}
	} else {
		const end = node.nextSibling;
		let cursor: Node | null = anchor;
		while (cursor !== node) {
			const next: Node | null = cursor!.nextSibling;
			rotate.call(parent, cursor!, end);
			cursor = next;
		}
	}
}

/**
 * The parent's state-preserving move, or null without one or while the
 * parent is detached. A form's named controls shadow both members, so only a
 * real `true` and a callable move count.
 */
function nativeMove(parent: Node): ((node: Node, anchor: Node | null) => void) | null {
	if (parent.isConnected !== true) return null;
	const move = (parent as Node & { moveBefore?: unknown }).moveBefore;
	return typeof move === 'function' ? (move as (node: Node, anchor: Node | null) => void) : null;
}

function containsFocus(node: Node, focused: Element | null): boolean {
	if (node === focused) return true;
	if (focused === null || node.nodeType !== 1) return false;
	let candidate: Element | undefined = focused;
	do {
		if ((node as Element).contains(candidate)) return true;
		// Native contains() stops at a shadow root. Its host remains part of
		// the editing subtree, including across nested or closed shadow roots.
		// A retired link can now be its own root, and its .host is a URL
		// string. Only a document fragment can be a ShadowRoot across realms.
		const root = candidate.getRootNode();
		candidate = root.nodeType === 11 ? (root as ShadowRoot).host : undefined;
	} while (candidate !== undefined);
	return false;
}
