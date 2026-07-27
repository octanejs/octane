// Ported verbatim from .base-ui/packages/react/src/menu/utils/findRootOwnerId.ts (v1.6.0). Pure —
// no octane adaptations needed.
//
// Walks up from a node to the nearest element carrying `data-rootownerid` (stamped on
// `Menu.Popup`), so a mouseup landing in ANOTHER popup of the same menu root can be told apart
// from a mouseup that landed outside the menu tree entirely.
import { getParentNode, isHTMLElement, isLastTraversableNode } from '@floating-ui/utils/dom';

export function findRootOwnerId(node: Node): string | undefined {
	if (isHTMLElement(node) && node.hasAttribute('data-rootownerid')) {
		return node.getAttribute('data-rootownerid') ?? undefined;
	}

	if (isLastTraversableNode(node)) {
		return undefined;
	}

	return findRootOwnerId(getParentNode(node));
}
