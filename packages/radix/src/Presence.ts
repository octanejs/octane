// Ported from @radix-ui/react-presence. Keeps a child mounted through its CSS exit
// animation: when `present` flips to false it stays mounted until `animationend`/
// `transitionend` (or unmounts immediately if there's no running animation). Pure DOM +
// octane hooks — no React internals. In environments without CSS animations (jsdom) it
// collapses to a plain present↔mounted conditional.
import {
	Children,
	cloneElement,
	isValidElement,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'octane';

import { useComposedRefs } from './compose-refs';
import { S, subSlot } from './internal';

type MachineState = 'mounted' | 'unmountSuspended' | 'unmounted';

const TRANSITIONS: Record<MachineState, Partial<Record<string, MachineState>>> = {
	mounted: { UNMOUNT: 'unmounted', ANIMATION_OUT: 'unmountSuspended' },
	unmountSuspended: { MOUNT: 'mounted', ANIMATION_END: 'unmounted' },
	unmounted: { MOUNT: 'mounted' },
};

function getAnimationName(styles?: CSSStyleDeclaration | null): string {
	return styles?.animationName || 'none';
}

function usePresence(
	present: boolean,
	slot: symbol,
): { isPresent: boolean; ref: (el: any) => void } {
	const [node, setNode] = useState<any>(null, subSlot(slot, 'node'));
	const stylesRef = useRef<CSSStyleDeclaration | null>(null, subSlot(slot, 'styles'));
	const prevPresentRef = useRef(present, subSlot(slot, 'prevPresent'));
	const prevAnimationNameRef = useRef<string>('none', subSlot(slot, 'prevAnim'));
	const [state, setState] = useState<MachineState>(
		present ? 'mounted' : 'unmounted',
		subSlot(slot, 'state'),
	);

	const send = useCallback(
		(event: string) => {
			setState((prev: MachineState) => TRANSITIONS[prev][event] ?? prev);
		},
		[],
		subSlot(slot, 'send'),
	);

	useEffect(
		() => {
			const currentAnimationName = getAnimationName(stylesRef.current);
			prevAnimationNameRef.current = state === 'mounted' ? currentAnimationName : 'none';
		},
		[state],
		subSlot(slot, 'e:anim'),
	);

	useLayoutEffect(
		() => {
			const styles = stylesRef.current;
			const wasPresent = prevPresentRef.current;
			if (wasPresent !== present) {
				const prevAnimationName = prevAnimationNameRef.current;
				const currentAnimationName = getAnimationName(styles);
				if (present) {
					send('MOUNT');
				} else if (currentAnimationName === 'none' || styles?.display === 'none') {
					send('UNMOUNT');
				} else {
					const isAnimating = prevAnimationName !== currentAnimationName;
					send(wasPresent && isAnimating ? 'ANIMATION_OUT' : 'UNMOUNT');
				}
				prevPresentRef.current = present;
			}
		},
		[present],
		subSlot(slot, 'e:present'),
	);

	useLayoutEffect(
		() => {
			if (node) {
				let timeoutId: any;
				const ownerWindow = node.ownerDocument?.defaultView ?? window;
				const handleAnimationEnd = (event: AnimationEvent) => {
					const currentAnimationName = getAnimationName(stylesRef.current);
					const isCurrentAnimation = currentAnimationName.includes(event.animationName);
					if (event.target === node && isCurrentAnimation) {
						send('ANIMATION_END');
					}
				};
				const handleAnimationStart = (event: AnimationEvent) => {
					if (event.target === node) {
						prevAnimationNameRef.current = getAnimationName(stylesRef.current);
					}
				};
				node.addEventListener('animationstart', handleAnimationStart);
				node.addEventListener('animationcancel', handleAnimationEnd);
				node.addEventListener('animationend', handleAnimationEnd);
				return () => {
					ownerWindow.clearTimeout(timeoutId);
					node.removeEventListener('animationstart', handleAnimationStart);
					node.removeEventListener('animationcancel', handleAnimationEnd);
					node.removeEventListener('animationend', handleAnimationEnd);
				};
			} else {
				send('ANIMATION_END');
			}
		},
		[node],
		subSlot(slot, 'e:node'),
	);

	return {
		isPresent: state === 'mounted' || state === 'unmountSuspended',
		ref: useCallback(
			(el: any) => {
				if (el) stylesRef.current = getComputedStyle(el);
				setNode(el);
			},
			[],
			subSlot(slot, 'ref'),
		),
	};
}

/**
 * `<Presence present>{child}</Presence>` — renders `child` while present or exit-animating.
 * `children` may be a single element or a render function `({ present }) => element`
 * (forceMount: it always renders and forwards `present`).
 */
export function Presence(props: any): any {
	const { present, children } = props;
	const slot = S('Presence');
	const presence = usePresence(present, slot);
	const forceMount = typeof children === 'function';
	const child = forceMount ? children({ present: presence.isPresent }) : Children.only(children);
	const childRef = isValidElement(child) ? (child as any).props?.ref : undefined;
	// A MEMOIZED composed ref — a fresh one each render would make octane re-attach it,
	// re-running usePresence's setNode → an infinite render loop.
	const ref = useComposedRefs(presence.ref, childRef, subSlot(slot, 'ref'));
	if (forceMount || presence.isPresent) {
		return isValidElement(child) ? cloneElement(child as any, { ref }) : child;
	}
	return null;
}
