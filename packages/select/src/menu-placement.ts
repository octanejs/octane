import type { CoercedMenuPlacement, MenuPlacement } from './types';

type ScrollTarget = HTMLElement | Window;

export interface PlacementArgs {
	maxHeight: number;
	menuEl: HTMLElement | null;
	minHeight: number;
	placement: MenuPlacement;
	shouldScroll: boolean;
	isFixedPosition: boolean;
	controlHeight: number;
}

export interface CalculatedMenuPlacementAndHeight {
	placement: CoercedMenuPlacement;
	maxHeight: number;
}

function isDocumentElement(element: ScrollTarget) {
	return element === document.documentElement || element === document.body || element === window;
}

function normalizedHeight(element: ScrollTarget) {
	return isDocumentElement(element) ? window.innerHeight : (element as HTMLElement).clientHeight;
}

function getScrollTop(element: ScrollTarget) {
	return isDocumentElement(element) ? window.pageYOffset : (element as HTMLElement).scrollTop;
}

function scrollTo(element: ScrollTarget, top: number) {
	if (isDocumentElement(element)) window.scrollTo(0, top);
	else (element as HTMLElement).scrollTop = top;
}

function getScrollParent(element: HTMLElement | null): ScrollTarget {
	if (!element) return typeof document === 'undefined' ? ({} as Window) : document.documentElement;
	let style = getComputedStyle(element);
	const excludeStaticParent = style.position === 'absolute';
	if (style.position === 'fixed') return document.documentElement;
	for (let parent = element.parentElement; parent; parent = parent.parentElement) {
		style = getComputedStyle(parent);
		if (excludeStaticParent && style.position === 'static') continue;
		if (/(auto|scroll)/.test(`${style.overflow}${style.overflowY}${style.overflowX}`)) {
			return parent;
		}
	}
	return document.documentElement;
}

function animatedScrollTo(element: ScrollTarget, to: number, duration = 200) {
	const start = getScrollTop(element);
	const change = to - start;
	const increment = 10;
	let currentTime = 0;
	const animate = () => {
		currentTime += increment;
		const elapsed = currentTime / duration - 1;
		scrollTo(element, change * (elapsed * elapsed * elapsed + 1) + start);
		if (currentTime < duration) window.requestAnimationFrame(animate);
	};
	animate();
}

export function getMenuPlacement({
	maxHeight: preferredMaxHeight,
	menuEl,
	minHeight,
	placement: preferredPlacement,
	shouldScroll,
	isFixedPosition,
	controlHeight,
}: PlacementArgs): CalculatedMenuPlacementAndHeight {
	const defaultState = { placement: 'bottom' as const, maxHeight: preferredMaxHeight };
	if (!menuEl || !menuEl.offsetParent) return defaultState;

	const scrollParent = getScrollParent(menuEl);
	const scrollHeight = (scrollParent as HTMLElement).getBoundingClientRect().height;
	const { bottom: menuBottom, height: menuHeight, top: menuTop } = menuEl.getBoundingClientRect();
	const containerTop = (menuEl.offsetParent as HTMLElement).getBoundingClientRect().top;
	const viewHeight = isFixedPosition ? window.innerHeight : normalizedHeight(scrollParent);
	const scrollTop = getScrollTop(scrollParent);
	const marginBottom = Number.parseInt(getComputedStyle(menuEl).marginBottom, 10);
	const marginTop = Number.parseInt(getComputedStyle(menuEl).marginTop, 10);
	const viewSpaceAbove = containerTop - marginTop;
	const viewSpaceBelow = viewHeight - menuTop;
	const scrollSpaceAbove = viewSpaceAbove + scrollTop;
	const scrollSpaceBelow = scrollHeight - scrollTop - menuTop;
	const scrollDown = menuBottom - viewHeight + scrollTop + marginBottom;
	const scrollUp = scrollTop + menuTop - marginTop;

	if (preferredPlacement === 'auto' || preferredPlacement === 'bottom') {
		if (viewSpaceBelow >= menuHeight) return defaultState;
		if (scrollSpaceBelow >= menuHeight && !isFixedPosition) {
			if (shouldScroll) animatedScrollTo(scrollParent, scrollDown, 160);
			return defaultState;
		}
		if (
			(!isFixedPosition && scrollSpaceBelow >= minHeight) ||
			(isFixedPosition && viewSpaceBelow >= minHeight)
		) {
			if (shouldScroll) animatedScrollTo(scrollParent, scrollDown, 160);
			return {
				placement: 'bottom',
				maxHeight: (isFixedPosition ? viewSpaceBelow : scrollSpaceBelow) - marginBottom,
			};
		}
		if (preferredPlacement === 'auto' || isFixedPosition) {
			const spaceAbove = isFixedPosition ? viewSpaceAbove : scrollSpaceAbove;
			return {
				placement: 'top',
				maxHeight:
					spaceAbove >= minHeight
						? Math.min(spaceAbove - marginBottom - controlHeight, preferredMaxHeight)
						: preferredMaxHeight,
			};
		}
		if (shouldScroll) scrollTo(scrollParent, scrollDown);
		return defaultState;
	}

	if (preferredPlacement === 'top') {
		if (viewSpaceAbove >= menuHeight) return { placement: 'top', maxHeight: preferredMaxHeight };
		if (scrollSpaceAbove >= menuHeight && !isFixedPosition) {
			if (shouldScroll) animatedScrollTo(scrollParent, scrollUp, 160);
			return { placement: 'top', maxHeight: preferredMaxHeight };
		}
		if (
			(!isFixedPosition && scrollSpaceAbove >= minHeight) ||
			(isFixedPosition && viewSpaceAbove >= minHeight)
		) {
			if (shouldScroll) animatedScrollTo(scrollParent, scrollUp, 160);
			return {
				placement: 'top',
				maxHeight: (isFixedPosition ? viewSpaceAbove : scrollSpaceAbove) - marginTop,
			};
		}
		return defaultState;
	}

	throw new Error(`Invalid placement provided "${preferredPlacement}".`);
}
