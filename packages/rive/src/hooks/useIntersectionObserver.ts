import { useCallback } from 'octane';
import ElementObserver from './elementObserver.ts';
import { splitSlot, subSlot } from '../internal.ts';

let observer: ElementObserver;
function getObserver() {
	if (!observer) {
		observer = new ElementObserver();
	}
	return observer;
}

/**
 * Hook to observe elements when they are intersecting with the viewport
 *
 * @returns - API to observer and unobserve elements
 */
export default function useIntersectionObserver(...rawArgs: unknown[]) {
	const [, slot] = splitSlot(rawArgs);

	const observe = useCallback(
		function observeElement(
			element: Element,
			callback: (entry: IntersectionObserverEntry) => void,
		) {
			const current = getObserver();
			current.registerCallback(element, callback);
		},
		[],
		subSlot(slot, 'observe'),
	);

	const unobserve = useCallback(
		function unobserveElement(element: Element) {
			const current = getObserver();
			current.removeCallback(element);
		},
		[],
		subSlot(slot, 'unobserve'),
	);

	return {
		observe: observe,
		unobserve: unobserve,
	};
}
