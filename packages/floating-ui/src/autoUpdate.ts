import {
	autoUpdate as autoUpdateDom,
	type AutoUpdateOptions,
	type FloatingElement,
	type ReferenceElement,
} from '@floating-ui/dom';
import { isElement } from '@floating-ui/utils/dom';
import { createResizeObserver } from 'octane';

/**
 * Retains Floating UI's initial update and ordinary update sources, while
 * publishing element resizes outside the browser's ResizeObserver delivery.
 */
export function autoUpdate(
	reference: ReferenceElement,
	floating: FloatingElement | null,
	update: () => void,
	options: AutoUpdateOptions = {},
): () => void {
	const { elementResize = typeof ResizeObserver === 'function', animationFrame = false } = options;
	const cleanup = autoUpdateDom(reference, floating, update, { ...options, elementResize: false });
	const referenceElement = isElement(reference) ? reference : reference.contextElement;
	let resizeObserver: ResizeObserver | null = null;
	let reobserveFrame = -1;

	if (elementResize) {
		resizeObserver = createResizeObserver((entries) => {
			if (floating && entries.some((entry) => entry.target === referenceElement)) {
				// Preserve Floating UI's size-middleware guard while geometry writes
				// from this update settle before floating observation resumes.
				resizeObserver!.unobserve(floating);
				cancelAnimationFrame(reobserveFrame);
				reobserveFrame = requestAnimationFrame(() => resizeObserver?.observe(floating));
			}
			update();
		});
		if (referenceElement && !animationFrame) resizeObserver.observe(referenceElement);
		if (floating) resizeObserver.observe(floating);
	}

	return () => {
		cleanup();
		resizeObserver?.disconnect();
		resizeObserver = null;
		if (reobserveFrame !== -1) cancelAnimationFrame(reobserveFrame);
	};
}
