import { useEffect, useRef, useState } from 'octane';
import type { Dimensions } from '../types.ts';
import { splitSlot, subSlot } from '../internal.ts';

type MutableRef<T> = { current: T };

// There are polyfills for this, but they add hundreds of lines of code
class FakeResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

function throttle(f: (...args: unknown[]) => void, delay: number) {
	let timer = 0;
	return function throttled(this: unknown, ...args: unknown[]) {
		clearTimeout(timer);
		const self = this;
		timer = window.setTimeout(function invoke() {
			f.apply(self, args);
		}, delay);
	};
}

const MyResizeObserver = globalThis.ResizeObserver || FakeResizeObserver;
const hasResizeObserver = globalThis.ResizeObserver !== undefined;

const useResizeObserver = hasResizeObserver;
const useWindowListener = !useResizeObserver;

/**
 * Hook to listen for a ref element's resize events being triggered. When resized,
 * it sets state to an object of {width: number, height: number} indicating the contentRect
 * size of the element at the new resize.
 *
 * @param containerRef - Ref element to listen for resize events on
 * @returns - Size object with width and height attributes
 */
export default function useSize(...rawArgs: unknown[]) {
	const [args, slot] = splitSlot(rawArgs);
	const containerRef = args[0] as MutableRef<HTMLElement | null>;
	const shouldResizeCanvasToContainer = (args[1] ?? true) as boolean;

	const [size, setSize] = useState<Dimensions>(
		{
			width: 0,
			height: 0,
		},
		subSlot(slot, 'size'),
	);

	// internet explorer does not support ResizeObservers.
	useEffect(
		function listenWindow() {
			if (typeof window !== 'undefined' && shouldResizeCanvasToContainer) {
				function handleResize() {
					setSize({
						width: window.innerWidth,
						height: window.innerHeight,
					});
				}

				if (useWindowListener) {
					// only pay attention to window size changes when we do not have the resizeObserver (IE only)
					handleResize();
					window.addEventListener('resize', handleResize);
				}

				return function cleanup() {
					window.removeEventListener('resize', handleResize);
				};
			}
		},
		[],
		subSlot(slot, 'window'),
	);
	const observer = useRef(
		new MyResizeObserver(
			throttle(function onEntries(entries: unknown) {
				if (useResizeObserver) {
					const list = entries as ResizeObserverEntry[];
					setSize({
						width: list[list.length - 1].contentRect.width,
						height: list[list.length - 1].contentRect.height,
					});
				}
			}, 0),
		),
		subSlot(slot, 'observer'),
	);

	useEffect(
		function observeContainer() {
			const currentObserver = observer.current;
			if (!shouldResizeCanvasToContainer) {
				currentObserver.disconnect();
				return;
			}
			const containerEl = containerRef.current;
			if (containerRef.current && useResizeObserver) {
				currentObserver.observe(containerRef.current);
			}

			return function cleanup() {
				currentObserver.disconnect();
				if (containerEl && useResizeObserver) {
					currentObserver.unobserve(containerEl);
				}
			};
		},
		[containerRef, observer],
		subSlot(slot, 'observe'),
	);

	return size;
}
