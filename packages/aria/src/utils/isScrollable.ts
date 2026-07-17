// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/isScrollable.ts).

export function isScrollable(node: Element | null, checkForOverflow?: boolean): boolean {
	if (!node) {
		return false;
	}
	let style = window.getComputedStyle(node);
	let root = document.scrollingElement || document.documentElement;
	let isScrollable = /(auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY);

	// Root element has `visible` overflow by default, but is scrollable nonetheless.
	if (node === root && style.overflow !== 'hidden') {
		isScrollable = true;
	}

	if (isScrollable && checkForOverflow) {
		isScrollable = node.scrollHeight !== node.clientHeight || node.scrollWidth !== node.clientWidth;
	}

	return isScrollable;
}
