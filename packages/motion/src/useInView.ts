import { inView } from 'motion';
import { useEffect, useState } from 'octane';

type ElementRef = { readonly current: Element | null };

export interface UseInViewOptions extends Omit<NonNullable<Parameters<typeof inView>[2]>, 'root'> {
	root?: ElementRef;
	once?: boolean;
	initial?: boolean;
}

const STATE = Symbol.for('octane-motion:useInView:state');
const EFFECT = Symbol.for('octane-motion:useInView:effect');

// Match motion/react at the pinned 12.42.2 release. The compiler composes
// these two internal slots with the caller's hook slot.
export function useInView(ref: ElementRef, options?: UseInViewOptions): boolean;
export function useInView(ref: ElementRef, options: UseInViewOptions | symbol = {}): boolean {
	// The manual hook adapter appends its slot in the omitted options position.
	const {
		root,
		margin,
		amount,
		once = false,
		initial = false,
	} = typeof options === 'symbol' ? {} : options;
	const [isInView, setInView] = useState(initial, STATE);
	useEffect(
		() => {
			if (!ref.current || (once && isInView)) return;
			const observerOptions = { root: (root && root.current) || undefined, margin, amount };
			return inView(
				ref.current,
				() => {
					setInView(true);
					return once ? undefined : () => setInView(false);
				},
				observerOptions,
			);
		},
		[root, ref, margin, once, amount],
		EFFECT,
	);
	return isInView;
}
