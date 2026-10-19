import { readLayout, type LayoutSnapshot } from './layout';

export function measureLayout(
	node: HTMLElement,
	restore: { value: string; priority: string } | null,
): LayoutSnapshot {
	if (!restore) return readLayout(node);

	const value = node.style.transform;
	const priority = node.style.getPropertyPriority('transform');
	const visual = node.getBoundingClientRect();
	const ancestors: Element[] = [];
	for (let element: Element | null = node; element;) {
		ancestors.push(element);
		element =
			element.assignedSlot ??
			element.parentElement ??
			(element.getRootNode() as ShadowRoot).host ??
			null;
	}
	const scrollingElement = node.ownerDocument.scrollingElement;
	if (scrollingElement && !ancestors.includes(scrollingElement)) ancestors.push(scrollingElement);
	const scrolls = ancestors.map((element) => ({
		element,
		left: element.scrollLeft,
		top: element.scrollTop,
		measuredLeft: 0,
		measuredTop: 0,
	}));
	let snapshot: LayoutSnapshot | undefined;
	let clamped = false;
	try {
		node.style.setProperty('transform', restore.value, restore.priority);
		snapshot = readLayout(node);
		for (const scroll of scrolls) {
			scroll.measuredLeft = scroll.element.scrollLeft;
			scroll.measuredTop = scroll.element.scrollTop;
			clamped ||= scroll.left !== scroll.measuredLeft || scroll.top !== scroll.measuredTop;
		}
		return snapshot;
	} finally {
		try {
			node.style.setProperty('transform', value, priority);
			if (snapshot && clamped) {
				// A matching visual frame supplies the viewport scroll displacement
				// without reconstructing affine ancestor transforms.
				for (const scroll of scrolls) {
					if (
						scroll.element.scrollLeft !== scroll.measuredLeft ||
						scroll.element.scrollTop !== scroll.measuredTop
					) {
						scroll.element.scrollTo({
							left: scroll.measuredLeft,
							top: scroll.measuredTop,
							behavior: 'instant',
						});
					}
				}
				const measuredVisual = node.getBoundingClientRect();
				const x = visual.left - measuredVisual.left;
				const y = visual.top - measuredVisual.top;
				snapshot.visual = {
					...snapshot.visual,
					left: snapshot.visual.left + x,
					top: snapshot.visual.top + y,
				};
				snapshot.box = {
					...snapshot.box,
					left: snapshot.box.left + x,
					top: snapshot.box.top + y,
				};
				snapshot.scroll.left -= x;
				snapshot.scroll.top -= y;
				if (snapshot.basis) {
					snapshot.basis.e += x;
					snapshot.basis.f += y;
				}
			}
		} finally {
			for (const scroll of scrolls) {
				if (scroll.element.scrollLeft !== scroll.left || scroll.element.scrollTop !== scroll.top) {
					scroll.element.scrollTo({ left: scroll.left, top: scroll.top, behavior: 'instant' });
				}
			}
		}
	}
}
