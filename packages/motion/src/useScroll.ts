// `useScroll()` — scroll-linked MotionValues. Returns `{ scrollX, scrollY,
// scrollXProgress, scrollYProgress }`; bind a progress value to a `motion.*`
// element's style, or read it imperatively. Reuses motion's framework-agnostic
// `scroll`.
import { motionValue, scroll } from 'motion';
import { useState, useEffect } from 'octane';

// Memoized — runs per hook call per render; the cache returns the identical
// Symbol.for-interned value without the concat + registry lookup.
const subCache = new Map<symbol, Map<string, symbol>>();
function sub(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subCache.get(slot);
	if (byTag === undefined) subCache.set(slot, (byTag = new Map()));
	let sym = byTag.get(tag);
	if (sym === undefined)
		byTag.set(tag, (sym = Symbol.for((slot.description ?? '') + ':us:' + tag)));
	return sym;
}

export interface ScrollOptions {
	container?: HTMLElement;
	target?: HTMLElement;
	axis?: 'x' | 'y';
	offset?: any;
}

export function useScroll(...args: any[]): {
	scrollX: any;
	scrollY: any;
	scrollXProgress: any;
	scrollYProgress: any;
} {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const options: ScrollOptions =
		args.length && typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

	const [values] = useState(
		() => ({
			scrollX: motionValue(0),
			scrollY: motionValue(0),
			scrollXProgress: motionValue(0),
			scrollYProgress: motionValue(0),
		}),
		sub(slot, 'values'),
	);

	useEffect(
		() => {
			// `scroll(onScroll, options)` reports offset (px) + progress (0–1) each frame.
			const stop = scroll((progress: number, info?: any) => {
				if (info) {
					values.scrollX.set(info.x.current);
					values.scrollY.set(info.y.current);
					values.scrollXProgress.set(info.x.progress);
					values.scrollYProgress.set(info.y.progress);
				} else {
					values.scrollYProgress.set(progress);
				}
			}, options as any);
			return () => {
				if (typeof stop === 'function') stop();
			};
		},
		[options.container, options.target, options.axis],
		sub(slot, 'effect'),
	);

	return values;
}
