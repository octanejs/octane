// `useTransform` — derive a MotionValue from one or more inputs. Four forms:
//   1) useTransform(() => x.get() * 2)               — transformer reads other MVs
//   2) useTransform(mv, [0, 100], [0, 1], options?)  — input→output range mapping
//   3) useTransform([a, b], ([av, bv]) => av + bv)   — multiple inputs + combiner
//   4) useTransform(mv, (latest) => latest * 2)      — single input + transformer
// Reuses motion's `transformValue` (forms 1, 3, 4) and `mapValue` (form 2). The
// output MotionValue self-subscribes to its inputs (updates are frame-scheduled); we
// create it once and `destroy()` it on unmount, which tears those subscriptions down.
import { transformValue, mapValue } from 'motion';
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
		byTag.set(tag, (sym = Symbol.for((slot.description ?? '') + ':ut:' + tag)));
	return sym;
}

export function useTransform(...args: any[]): any {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	// User args = everything except a trailing compiler-injected slot symbol.
	const a = slot !== undefined ? args.slice(0, -1) : args;
	const [input, second, third, options] = a;

	const [mv] = useState(
		() => {
			// Form 1: a transformer function that reads other MotionValues internally.
			if (typeof input === 'function') {
				return transformValue(input);
			}
			// Form 3: an array of MotionValue inputs + a combiner over their latest values.
			if (Array.isArray(input)) {
				const inputs = input;
				const combiner = second as (latest: any[]) => any;
				return transformValue(() => combiner(inputs.map((v) => v.get())));
			}
			// Form 4: a single MotionValue + a transformer over its latest scalar value.
			if (typeof second === 'function') {
				const inp = input;
				const fn = second as (latest: any) => any;
				return transformValue(() => fn(inp.get()));
			}
			// Form 2: single MotionValue mapped from inputRange → outputRange.
			return mapValue(input, second as number[], third as any[], options);
		},
		sub(slot, 'mv'),
	);

	// `transformValue`/`mapValue` register their input-unsubscribe on the output
	// value's `destroy` event, so destroying it on unmount is the correct teardown.
	useEffect(() => () => mv.destroy(), [], sub(slot, 'clean'));

	return mv;
}
