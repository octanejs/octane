// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/SharedElementTransition.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, adapted with `useObjectRef` exactly like upstream's forwarded ref; `flushSync`
// comes from `'octane'` (upstream: react-dom); the plain-`.ts` components use the S()/subSlot
// component-slot convention (`useContext` stays slotless — context-identity keyed); React's
// HTMLAttributes/ReactNode/RefObject types → structural aliases; the explicit dep array is
// preserved verbatim; the FLIP snapshot/animation logic is verbatim — it reads live rects,
// computed styles, and Web Animations (all inert in jsdom, real in browsers).
import { createContext, createElement, flushSync, useContext, useRef, useState } from 'octane';

import { S, subSlot } from '../internal';
import { useLayoutEffect } from '../utils/useLayoutEffect';
import { useObjectRef } from '../utils/useObjectRef';
import { dom, type RenderProps, useRenderProps } from './utils';

// octane adaptation: structural aliases for the React types upstream drags along.
type HTMLAttributes = Record<string, any>;
type ReactNode = any;
type RefObject<T> = { current: T };

interface Snapshot {
	rect: DOMRect;
	style: [string, string][];
}

const SharedElementContext = createContext<RefObject<{ [name: string]: Snapshot }> | null>(null);

export interface SharedElementTransitionProps {
	children: ReactNode;
}

/**
 * A scope for SharedElements, which animate between parents.
 */
export function SharedElementTransition(props: SharedElementTransitionProps): any {
	const slot = S('SharedElementTransition');
	let ref = useRef<{ [name: string]: Snapshot }>({}, subSlot(slot, 'scope'));
	return createElement(SharedElementContext.Provider, { value: ref, children: props.children });
}

export interface SharedElementRenderProps {
	/**
	 * Whether the element is currently entering.
	 *
	 * @selector [data-entering]
	 */
	isEntering: boolean;
	/**
	 * Whether the element is currently exiting.
	 *
	 * @selector [data-exiting]
	 */
	isExiting: boolean;
}

export interface SharedElementPropsBase
	extends
		Omit<HTMLAttributes, 'children' | 'className' | 'style'>,
		RenderProps<SharedElementRenderProps> {}

export interface SharedElementProps extends SharedElementPropsBase {
	name: string;
	isVisible?: boolean;
}

/**
 * An element that animates between its old and new position when moving between parents.
 */
export function SharedElement(props: SharedElementProps): any {
	const slot = S('SharedElement');
	let {
		name,
		isVisible = true,
		children,
		className,
		style,
		render,
		ref: forwardedRef,
		...divProps
	} = props;
	let [state, setState] = useState<string>(
		isVisible ? 'visible' : 'hidden',
		subSlot(slot, 'state'),
	);
	let scopeRef = useContext(SharedElementContext);
	if (!scopeRef) {
		throw new Error('<SharedElement> must be rendered inside a <SharedElementTransition>');
	}

	if (isVisible && state === 'hidden') {
		setState('visible');
	}

	let ref = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));
	useLayoutEffect(
		() => {
			let element = ref.current;
			let scope = scopeRef.current;
			let prevSnapshot = scope[name];
			let frame: number | null = null;

			if (element && isVisible && prevSnapshot) {
				// Element is transitioning from a previous instance.
				setState('visible');
				let animations = element.getAnimations();

				// Set properties to animate from.
				let values = prevSnapshot.style.map(([property, prevValue]) => {
					let value = (element.style as any)[property];
					if (property === 'translate') {
						let prevRect = prevSnapshot.rect;
						let currentItem = element.getBoundingClientRect();
						let deltaX = prevRect.left - currentItem?.left;
						let deltaY = prevRect.top - currentItem?.top;
						element.style.translate = `${deltaX}px ${deltaY}px`;
					} else {
						(element.style as any)[property] = prevValue;
					}
					return [property, value];
				});

				// Cancel any new animations triggered by these properties.
				for (let a of element.getAnimations()) {
					if (!animations.includes(a)) {
						a.cancel();
					}
				}

				// Remove overrides after one frame to animate to the current values.
				frame = requestAnimationFrame(() => {
					frame = null;
					for (let [property, value] of values) {
						(element!.style as any)[property] = value;
					}
				});

				delete scope[name];
			} else if (element && isVisible && !prevSnapshot) {
				// No previous instance exists, apply the entering state.
				queueMicrotask(() => flushSync(() => setState('entering')));
				frame = requestAnimationFrame(() => {
					frame = null;
					setState('visible');
				});
			} else if (element && !isVisible) {
				// Wait until layout effects finish, and check if a snapshot still exists.
				// If so, no new SharedElement consumed it, so enter the exiting state.
				queueMicrotask(() => {
					if (scope[name]) {
						delete scope[name];
						flushSync(() => setState('exiting'));
						Promise.all(element!.getAnimations().map((a) => a.finished))
							.then(() => setState('hidden'))
							.catch(() => {});
					} else {
						// Snapshot was consumed by another instance, unmount.
						setState('hidden');
					}
				});
			}

			return () => {
				if (frame != null) {
					cancelAnimationFrame(frame);
				}

				if (element && element.isConnected && !element.hasAttribute('data-exiting')) {
					// On unmount, store a snapshot of the rectangle and computed style for transitioning properties.
					let style = window.getComputedStyle(element);
					if (style.transitionProperty !== 'none') {
						let transitionProperty = style.transitionProperty.split(/\s*,\s*/);
						scope[name] = {
							rect: element.getBoundingClientRect(),
							style: transitionProperty.map((p) => [p, (style as any)[p]] as [string, string]),
						};
					}
				}
			};
		},
		[ref, scopeRef, name, isVisible],
		subSlot(slot, 'transition'),
	);

	let renderProps = useRenderProps(
		{
			children,
			className,
			style,
			render,
			values: {
				isEntering: state === 'entering',
				isExiting: state === 'exiting',
			},
		},
		subSlot(slot, 'renderProps'),
	);

	if (state === 'hidden') {
		return null;
	}

	return createElement(dom.div, {
		...divProps,
		...renderProps,
		ref,
		'data-entering': state === 'entering' || undefined,
		'data-exiting': state === 'exiting' || undefined,
	});
}
