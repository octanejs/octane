// Sibling-scanning DOM helpers used by group-level keyboard navigation.

export function findNextSibling(el: Element, selector: string): Element | undefined {
	let sibling = el.nextElementSibling;
	while (sibling) {
		if (sibling.matches(selector)) return sibling;
		sibling = sibling.nextElementSibling;
	}
	return undefined;
}

export function findPreviousSibling(el: Element, selector: string): Element | undefined {
	let sibling = el.previousElementSibling;
	while (sibling) {
		if (sibling.matches(selector)) return sibling;
		sibling = sibling.previousElementSibling;
	}
	return undefined;
}
