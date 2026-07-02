// Ported from @radix-ui/react-presence (source:
// .radix-primitives/packages/react/presence/src/presence.tsx). Keeps a child mounted
// through its CSS exit animation: when `present` flips to false it stays mounted until
// `animationend`/`animationcancel` (or unmounts immediately if no animation is running).
// Pure DOM + octane hooks — in environments without CSS animations (jsdom) it collapses
// to a plain present↔mounted conditional.
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
	const [node, setNode] = useState<HTMLElement | null>(null, subSlot(slot, 'node'));
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
			const hasPresentChanged = wasPresent !== present;
			if (hasPresentChanged) {
				const prevAnimationName = prevAnimationNameRef.current;
				const currentAnimationName = getAnimationName(styles);
				if (present) {
					send('MOUNT');
				} else if (currentAnimationName === 'none' || styles?.display === 'none') {
					// If there is no exit animation or the element is hidden, animations won't
					// run so we unmount instantly.
					send('UNMOUNT');
				} else {
					// When `present` changes to `false`, we check changes to animation-name to
					// determine whether an animation has started (computed styles, because there
					// is no `animationrun` event and `animationstart` fires after
					// `animation-delay` has expired — too late).
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
				const ownerWindow = node.ownerDocument.defaultView ?? window;
				// Triggering an ANIMATION_OUT during an ANIMATION_IN fires `animationcancel`
				// for ANIMATION_IN after entering `unmountSuspended` — only honor the
				// currently-active animation.
				const handleAnimationEnd = (event: AnimationEvent): void => {
					const currentAnimationName = getAnimationName(stylesRef.current);
					// event.animationName is unescaped CSS syntax; escape to compare with the
					// computed animation-name.
					const escaped =
						typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
							? CSS.escape(event.animationName)
							: event.animationName;
					const isCurrentAnimation = currentAnimationName.includes(escaped);
					if (event.target === node && isCurrentAnimation) {
						send('ANIMATION_END');
						// Force the last keyframe's styles while the (kept-mounted) node waits
						// for the state to commit, removing a flash of pre-animation content.
						if (!prevPresentRef.current) {
							const currentFillMode = node.style.animationFillMode;
							node.style.animationFillMode = 'forwards';
							// Reset after the node had time to unmount (for cases where the
							// consumer chooses not to unmount). Sooner than setTimeout (e.g.
							// rAF) still flashes.
							timeoutId = ownerWindow.setTimeout(() => {
								if (node.style.animationFillMode === 'forwards') {
									node.style.animationFillMode = currentFillMode;
								}
							});
						}
					}
				};
				const handleAnimationStart = (event: AnimationEvent): void => {
					if (event.target === node) {
						// An animation started: record its name as the previous animation.
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
				// Transition to unmounted if the node is removed prematurely (not during
				// cleanup — the node may change but still exist).
				send('ANIMATION_END');
			}
		},
		[node],
		subSlot(slot, 'e:node'),
	);

	return {
		isPresent: state === 'mounted' || state === 'unmountSuspended',
		ref: useCallback(
			(el: HTMLElement | null) => {
				stylesRef.current = el ? getComputedStyle(el) : null;
				setNode(el);
			},
			[],
			subSlot(slot, 'ref'),
		),
	};
}

/**
 * Compose refs with a callback whose identity NEVER changes, even when the composed refs
 * do (the latest refs are read at attach/detach time). Radix added this for the exact
 * loop class we also hit: a per-render composed-ref identity makes the renderer
 * detach/re-attach every commit, and since Presence's own ref calls `setNode`, an
 * unstable consumer ref would loop forever (radix-ui/primitives#3664).
 */
function useStableComposedRefs(
	refs: any[],
	slot: symbol,
): (node: HTMLElement | null) => void | (() => void) {
	const refsRef = useRef(refs, subSlot(slot, 'refsRef'));
	refsRef.current = refs;
	return useCallback(
		(node: HTMLElement | null) => {
			const currentRefs = refsRef.current;
			let hasCleanup = false;
			const cleanups = currentRefs.map((ref) => {
				const cleanup = setRefValue(ref, node);
				if (!hasCleanup && typeof cleanup === 'function') hasCleanup = true;
				return cleanup;
			});
			if (hasCleanup) {
				return () => {
					for (let i = 0; i < cleanups.length; i++) {
						const cleanup = cleanups[i];
						if (typeof cleanup === 'function') cleanup();
						else setRefValue(currentRefs[i], null);
					}
				};
			}
		},
		[],
		subSlot(slot, 'cb'),
	);
}

function setRefValue(ref: any, value: HTMLElement | null): void | (() => void) {
	if (typeof ref === 'function') return ref(value);
	if (ref !== null && ref !== undefined) ref.current = value;
}

/**
 * `<Presence present>{child}</Presence>` — renders `child` while present or
 * exit-animating. `children` may be a single element or a render function
 * `({ present }) => element` (forceMount: it always renders and forwards `present`).
 */
export function Presence(props: any): any {
	const { present, children } = props;
	const slot = S('Presence');
	const presence = usePresence(present, slot);
	const forceMount = typeof children === 'function';
	const child = forceMount ? children({ present: presence.isPresent }) : Children.only(children);
	const childRef = isValidElement(child) ? (child as any).props?.ref : undefined;
	const ref = useStableComposedRefs([presence.ref, childRef], slot);
	if (forceMount || presence.isPresent) {
		return isValidElement(child) ? cloneElement(child as any, { ref }) : child;
	}
	return null;
}

export { Presence as Root };
