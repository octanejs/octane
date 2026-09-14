import type { IntersectionObserverInitWithOptions, ObserverInstanceCallback } from './types.js';

const observerMap = new Map<
	string,
	{
		id: string;
		observer: IntersectionObserver;
		elements: Map<Element, ObserverInstanceCallback[]>;
	}
>();
const rootIds = new WeakMap<object, number>();
let rootId = 0;
let unsupportedValue: boolean | undefined;

function getRootId(root: IntersectionObserverInit['root']) {
	if (!root) return '0';
	let id = rootIds.get(root);
	if (!id) {
		id = ++rootId;
		rootIds.set(root, id);
	}
	return String(id);
}

export function optionsToId(options: IntersectionObserverInitWithOptions = {}) {
	return Object.keys(options)
		.sort()
		.filter((key) => options[key as keyof IntersectionObserverInitWithOptions] !== undefined)
		.map((key) => {
			const value = options[key as keyof IntersectionObserverInitWithOptions];
			return `${key}_${key === 'root' ? getRootId(value as Element | Document | null) : value}`;
		})
		.toString();
}

function createObserver(options: IntersectionObserverInitWithOptions) {
	const id = optionsToId(options);
	let instance = observerMap.get(id);
	if (instance) return instance;

	const elements = new Map<Element, ObserverInstanceCallback[]>();
	const observer = new IntersectionObserver((entries) => {
		entries.forEach((entry) => {
			const inView =
				entry.isIntersecting &&
				thresholds.some((threshold) => entry.intersectionRatio >= threshold);
			const visibleEntry = entry as IntersectionObserverEntry & { isVisible?: boolean };
			if (options.trackVisibility && visibleEntry.isVisible === undefined) {
				visibleEntry.isVisible = inView;
			}
			elements
				.get(entry.target)
				?.slice()
				.forEach((callback) => callback(inView, entry));
		});
	}, options);
	const thresholds =
		observer.thresholds ||
		(Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0]);
	instance = { id, observer, elements };
	observerMap.set(id, instance);
	return instance;
}

export function observe(
	element: Element,
	callback: ObserverInstanceCallback,
	options: IntersectionObserverInitWithOptions = {},
	fallbackInView = unsupportedValue,
) {
	if (typeof window.IntersectionObserver === 'undefined' && fallbackInView !== undefined) {
		const bounds = element.getBoundingClientRect();
		callback(fallbackInView, {
			isIntersecting: fallbackInView,
			target: element,
			intersectionRatio: typeof options.threshold === 'number' ? options.threshold : 0,
			time: 0,
			boundingClientRect: bounds,
			intersectionRect: bounds,
			rootBounds: bounds,
		});
		return () => {};
	}

	const { id, observer, elements } = createObserver(options);
	const callbacks = elements.get(element) ?? [];
	if (!elements.has(element)) {
		elements.set(element, callbacks);
		observer.observe(element);
	}
	callbacks.push(callback);

	return () => {
		const current = elements.get(element);
		if (!current) return;
		const index = current.indexOf(callback);
		if (index >= 0) current.splice(index, 1);
		if (current.length > 0) return;
		elements.delete(element);
		observer.unobserve(element);
		if (elements.size === 0) {
			observer.disconnect();
			observerMap.delete(id);
		}
	};
}

export function defaultFallbackInView(inView: boolean | undefined) {
	unsupportedValue = inView;
}
