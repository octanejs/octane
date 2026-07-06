// Ported from .base-ui/packages/utils/src/useScrollLock.ts (v1.6.0). Locks document scroll while a
// modal popup is open (a ref-counted `ScrollLocker` singleton; overlay-scrollbar vs inset-scrollbar
// strategies; scrollbar-gutter compensation). Pure DOM apart from the hook — octane adaptation:
// `useIsoLayoutEffect` → `useLayoutEffect` with an explicit slot.
import { isOverflowElement } from '@floating-ui/utils/dom';
import { useLayoutEffect } from 'octane';

import { addEventListener } from './addEventListener';
import { platform } from './platform';
import { ownerDocument, ownerWindow } from './owner';
import { Timeout } from './useTimeout';
import { AnimationFrame } from './useAnimationFrame';
import { NOOP } from './empty';

let originalHtmlStyles: Partial<CSSStyleDeclaration> = {};
let originalBodyStyles: Partial<CSSStyleDeclaration> = {};
let originalHtmlScrollBehavior = '';

function hasInsetScrollbars(referenceElement: Element | null) {
	if (typeof document === 'undefined') {
		return false;
	}
	const doc = ownerDocument(referenceElement);
	const win = ownerWindow(doc);
	return win.innerWidth - doc.documentElement.clientWidth > 0;
}

function supportsStableScrollbarGutter(referenceElement: Element | null) {
	const supported =
		typeof CSS !== 'undefined' && CSS.supports && CSS.supports('scrollbar-gutter', 'stable');
	if (!supported || typeof document === 'undefined') {
		return false;
	}
	const doc = ownerDocument(referenceElement);
	const html = doc.documentElement;
	const body = doc.body;
	const scrollContainer = isOverflowElement(html) ? html : body;
	const originalScrollContainerOverflowY = scrollContainer.style.overflowY;
	const originalHtmlStyleGutter = html.style.scrollbarGutter;
	html.style.scrollbarGutter = 'stable';
	scrollContainer.style.overflowY = 'scroll';
	const before = scrollContainer.offsetWidth;
	scrollContainer.style.overflowY = 'hidden';
	const after = scrollContainer.offsetWidth;
	scrollContainer.style.overflowY = originalScrollContainerOverflowY;
	html.style.scrollbarGutter = originalHtmlStyleGutter;
	return before === after;
}

function preventScrollOverlayScrollbars(referenceElement: Element | null) {
	const doc = ownerDocument(referenceElement);
	const html = doc.documentElement;
	const body = doc.body;
	const elementToLock = isOverflowElement(html) ? html : body;
	const originalElementToLockStyles = {
		overflowY: elementToLock.style.overflowY,
		overflowX: elementToLock.style.overflowX,
	};
	Object.assign(elementToLock.style, { overflowY: 'hidden', overflowX: 'hidden' });
	return () => {
		Object.assign(elementToLock.style, originalElementToLockStyles);
	};
}

function preventScrollInsetScrollbars(referenceElement: Element | null) {
	const doc = ownerDocument(referenceElement);
	const html = doc.documentElement;
	const body = doc.body;
	const win = ownerWindow(html);

	let scrollTop = 0;
	let scrollLeft = 0;
	let updateGutterOnly = false;
	const resizeFrame = AnimationFrame.create();

	if (platform.engine.webkit && (win.visualViewport?.scale ?? 1) !== 1) {
		return () => {};
	}

	function lockScroll() {
		const htmlStyles = win.getComputedStyle(html);
		const bodyStyles = win.getComputedStyle(body);
		const htmlScrollbarGutterValue = htmlStyles.scrollbarGutter || '';
		const hasBothEdges = htmlScrollbarGutterValue.includes('both-edges');
		const scrollbarGutterValue = hasBothEdges ? 'stable both-edges' : 'stable';

		scrollTop = html.scrollTop;
		scrollLeft = html.scrollLeft;

		originalHtmlStyles = {
			scrollbarGutter: html.style.scrollbarGutter,
			overflowY: html.style.overflowY,
			overflowX: html.style.overflowX,
		};
		originalHtmlScrollBehavior = html.style.scrollBehavior;

		originalBodyStyles = {
			position: body.style.position,
			height: body.style.height,
			width: body.style.width,
			boxSizing: body.style.boxSizing,
			overflowY: body.style.overflowY,
			overflowX: body.style.overflowX,
			scrollBehavior: body.style.scrollBehavior,
		};

		const isScrollableY = html.scrollHeight > html.clientHeight;
		const isScrollableX = html.scrollWidth > html.clientWidth;
		const hasConstantOverflowY =
			htmlStyles.overflowY === 'scroll' || bodyStyles.overflowY === 'scroll';
		const hasConstantOverflowX =
			htmlStyles.overflowX === 'scroll' || bodyStyles.overflowX === 'scroll';

		const scrollbarWidth = Math.max(0, win.innerWidth - body.clientWidth);
		const scrollbarHeight = Math.max(0, win.innerHeight - body.clientHeight);

		const marginY = parseFloat(bodyStyles.marginTop) + parseFloat(bodyStyles.marginBottom);
		const marginX = parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight);
		const elementToLock = isOverflowElement(html) ? html : body;

		updateGutterOnly = supportsStableScrollbarGutter(referenceElement);

		if (updateGutterOnly) {
			html.style.scrollbarGutter = scrollbarGutterValue;
			elementToLock.style.overflowY = 'hidden';
			elementToLock.style.overflowX = 'hidden';
			return;
		}

		Object.assign(html.style, {
			scrollbarGutter: scrollbarGutterValue,
			overflowY: 'hidden',
			overflowX: 'hidden',
		});

		if (isScrollableY || hasConstantOverflowY) {
			html.style.overflowY = 'scroll';
		}
		if (isScrollableX || hasConstantOverflowX) {
			html.style.overflowX = 'scroll';
		}

		Object.assign(body.style, {
			position: 'relative',
			height:
				marginY || scrollbarHeight ? `calc(100dvh - ${marginY + scrollbarHeight}px)` : '100dvh',
			width: marginX || scrollbarWidth ? `calc(100vw - ${marginX + scrollbarWidth}px)` : '100vw',
			boxSizing: 'border-box',
			overflow: 'hidden',
			scrollBehavior: 'unset',
		});

		body.scrollTop = scrollTop;
		body.scrollLeft = scrollLeft;
		html.setAttribute('data-base-ui-scroll-locked', '');
		html.style.scrollBehavior = 'unset';
	}

	function cleanup() {
		Object.assign(html.style, originalHtmlStyles);
		Object.assign(body.style, originalBodyStyles);
		if (!updateGutterOnly) {
			html.scrollTop = scrollTop;
			html.scrollLeft = scrollLeft;
			html.removeAttribute('data-base-ui-scroll-locked');
			html.style.scrollBehavior = originalHtmlScrollBehavior;
		}
	}

	function handleResize() {
		cleanup();
		resizeFrame.request(lockScroll);
	}

	lockScroll();
	const unsubscribeResize = addEventListener(win, 'resize', handleResize);

	return () => {
		resizeFrame.cancel();
		cleanup();
		if (typeof win.removeEventListener === 'function') {
			unsubscribeResize();
		}
	};
}

class ScrollLocker {
	lockCount = 0;
	restore = null as (() => void) | null;
	timeoutLock = Timeout.create();
	timeoutUnlock = Timeout.create();

	acquire(referenceElement: Element | null) {
		this.lockCount += 1;
		if (this.lockCount === 1 && this.restore === null) {
			this.timeoutLock.start(0, () => this.lock(referenceElement));
		}
		return this.release;
	}

	release = () => {
		this.lockCount -= 1;
		if (this.lockCount === 0 && this.restore) {
			this.timeoutUnlock.start(0, this.unlock);
		}
	};

	private unlock = () => {
		if (this.lockCount === 0 && this.restore) {
			this.restore?.();
			this.restore = null;
		}
	};

	private lock(referenceElement: Element | null) {
		if (this.lockCount === 0 || this.restore !== null) {
			return;
		}
		const doc = ownerDocument(referenceElement);
		const html = doc.documentElement;
		const htmlOverflowY = ownerWindow(html).getComputedStyle(html).overflowY;
		if (htmlOverflowY === 'hidden' || htmlOverflowY === 'clip') {
			this.restore = NOOP;
			return;
		}
		const hasOverlayScrollbars = platform.os.ios || !hasInsetScrollbars(referenceElement);
		this.restore = hasOverlayScrollbars
			? preventScrollOverlayScrollbars(referenceElement)
			: preventScrollInsetScrollbars(referenceElement);
	}
}

const SCROLL_LOCKER = new ScrollLocker();

/**
 * Locks the scroll of the document when enabled. octane: threads an explicit slot for the effect.
 */
export function useScrollLock(
	enabled: boolean,
	referenceElement: Element | null,
	slot: symbol | undefined,
): void {
	useLayoutEffect(
		() => {
			if (!enabled) {
				return undefined;
			}
			return SCROLL_LOCKER.acquire(referenceElement);
		},
		[enabled, referenceElement],
		slot,
	);
}
