// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/getScrollParents.ts).
// Verbatim (no React surface).
import { isScrollable } from './isScrollable';

export function getScrollParents(node: Element, checkForOverflow?: boolean): Element[] {
	let parentElements: Element[] = [];
	let root = document.scrollingElement || document.documentElement;

	while (node) {
		if (isScrollable(node, checkForOverflow)) {
			parentElements.push(node);
		}
		if (node === root) {
			break;
		}
		node = node.parentElement as Element;
	}

	return parentElements;
}
