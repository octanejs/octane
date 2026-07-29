import { flushSync } from './runtime.js';

/**
 * Clamp jsdom's stored scroll position to the range its layout metrics report.
 * Browsers do this for programmatic scroll assignments, but jsdom can retain an
 * out-of-range value because it does not perform layout. Dispatch the native
 * event so components observe the normalized position through their public
 * scroll boundary.
 */
export function clampJsdomScrollTop(element: Element): void {
	const scrollTop = Number.isFinite(element.scrollTop) ? element.scrollTop : 0;
	const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
	const clampedScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop));
	if (clampedScrollTop === element.scrollTop) return;

	flushSync(() => {
		element.scrollTop = clampedScrollTop;
		element.dispatchEvent(new Event('scroll'));
	});
}
