// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/getScrollParent.ts).
// octane adaptations: none (pure DOM walk); ports verbatim.
import { isScrollable } from './isScrollable';

export function getScrollParent(node: Element, checkForOverflow?: boolean): Element {
	let scrollableNode: Element | null = node;
	if (isScrollable(scrollableNode, checkForOverflow)) {
		scrollableNode = scrollableNode.parentElement;
	}

	while (scrollableNode && !isScrollable(scrollableNode, checkForOverflow)) {
		scrollableNode = scrollableNode.parentElement;
	}

	return scrollableNode || document.scrollingElement || document.documentElement;
}
