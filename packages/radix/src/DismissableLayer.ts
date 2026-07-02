// Ported from @radix-ui/react-dismissable-layer. A layer that can be dismissed by Escape,
// pointer-down outside, or focus outside — with a module-level layer stack so nested layers
// dismiss top-down, optional body pointer-events disabling (modal), branches (outside
// elements that shouldn't dismiss), and dismissable "surfaces" (e.g. a dialog overlay —
// pressing one dismisses even if it stops propagation). React's context-with-default (no
// Provider is ever rendered for it in Radix) → a module-level singleton; `useCallbackRef`/
// `useEffectEvent` → octane `useEffectEvent`; discrete custom-event dispatch → flushSync.
import { createElement, useEffect, useEffectEvent, useRef, useState } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { S, subSlot } from './internal';
import { dispatchDiscreteCustomEvent, Primitive } from './Primitive';

const CONTEXT_UPDATE = 'dismissableLayer.update';
const POINTER_DOWN_OUTSIDE = 'dismissableLayer.pointerDownOutside';
const FOCUS_OUTSIDE = 'dismissableLayer.focusOutside';

let originalBodyPointerEvents: string;

// Radix models this as React context but never renders a Provider — every consumer sees
// the module-level default. Port it as a plain singleton.
const layerContext = {
	layers: new Set<HTMLElement>(),
	layersWithOutsidePointerEventsDisabled: new Set<HTMLElement>(),
	branches: new Set<HTMLElement>(),
	// Outside elements that belong to a layer's own dismiss affordance (eg, a dialog
	// overlay). Pressing them should dismiss the layer regardless of whether or not they
	// stop propagation.
	dismissableSurfaces: new Set<HTMLElement>(),
};

export function DismissableLayer(props: any): any {
	const slot = S('DismissableLayer');
	const {
		disableOutsidePointerEvents = false,
		deferPointerDownOutside = false,
		onEscapeKeyDown,
		onPointerDownOutside,
		onFocusOutside,
		onInteractOutside,
		onDismiss,
		ref: forwardedRef,
		...layerProps
	} = props ?? {};
	const context = layerContext;
	const [node, setNode] = useState<HTMLElement | null>(null, subSlot(slot, 'node'));
	const ownerDocument = node?.ownerDocument ?? globalThis?.document;
	const [, force] = useState({}, subSlot(slot, 'force'));
	const composedRefs = useComposedRefs(forwardedRef, setNode, subSlot(slot, 'refs'));

	const layers = Array.from(context.layers);
	const [highestLayerWithOutsidePointerEventsDisabled] = [
		...context.layersWithOutsidePointerEventsDisabled,
	].slice(-1);
	const highestLayerWithOutsidePointerEventsDisabledIndex = layers.indexOf(
		highestLayerWithOutsidePointerEventsDisabled,
	);
	const index = node ? layers.indexOf(node) : -1;
	const isBodyPointerEventsDisabled = context.layersWithOutsidePointerEventsDisabled.size > 0;
	const isPointerEventsEnabled = index >= highestLayerWithOutsidePointerEventsDisabledIndex;

	const isDeferredPointerDownOutsideRef = useRef(false, subSlot(slot, 'deferred'));
	const pointerDownOutside = usePointerDownOutside(
		(event: any) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			const isPointerDownOnBranch = [...context.branches].some((branch) => branch.contains(target));
			if (!isPointerEventsEnabled || isPointerDownOnBranch) return;
			onPointerDownOutside?.(event);
			onInteractOutside?.(event);
			if (!event.defaultPrevented) onDismiss?.();
		},
		{
			ownerDocument,
			deferPointerDownOutside,
			isDeferredPointerDownOutsideRef,
			dismissableSurfaces: context.dismissableSurfaces,
		},
		subSlot(slot, 'pdo'),
	);

	const focusOutside = useFocusOutside(
		(event: any) => {
			if (deferPointerDownOutside && isDeferredPointerDownOutsideRef.current) return;
			const target = event.target;
			const isFocusInBranch = [...context.branches].some((branch) => branch.contains(target));
			if (isFocusInBranch) return;
			onFocusOutside?.(event);
			onInteractOutside?.(event);
			if (!event.defaultPrevented) onDismiss?.();
		},
		ownerDocument,
		subSlot(slot, 'fo'),
	);

	const isHighestLayer = node ? index === layers.length - 1 : false;
	const handleKeyDown = useEffectEvent(
		(event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			onEscapeKeyDown?.(event);
			if (!event.defaultPrevented && onDismiss) {
				event.preventDefault();
				onDismiss();
			}
		},
		subSlot(slot, 'esc'),
	);

	useEffect(
		() => {
			if (!isHighestLayer) return;
			ownerDocument.addEventListener('keydown', handleKeyDown, { capture: true });
			return () => ownerDocument.removeEventListener('keydown', handleKeyDown, { capture: true });
		},
		[ownerDocument, isHighestLayer],
		subSlot(slot, 'e:esc'),
	);

	useEffect(
		() => {
			if (!node) return;
			if (disableOutsidePointerEvents) {
				if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
					originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;
					ownerDocument.body.style.pointerEvents = 'none';
				}
				context.layersWithOutsidePointerEventsDisabled.add(node);
			}
			context.layers.add(node);
			dispatchUpdate();
			return () => {
				if (disableOutsidePointerEvents) {
					context.layersWithOutsidePointerEventsDisabled.delete(node);
					if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
						ownerDocument.body.style.pointerEvents = originalBodyPointerEvents;
					}
				}
			};
		},
		[node, ownerDocument, disableOutsidePointerEvents],
		subSlot(slot, 'e:layer'),
	);

	useEffect(
		() => {
			return () => {
				if (!node) return;
				context.layers.delete(node);
				context.layersWithOutsidePointerEventsDisabled.delete(node);
				dispatchUpdate();
			};
		},
		[node],
		subSlot(slot, 'e:cleanup'),
	);

	useEffect(
		() => {
			const handleUpdate = (): void => force({});
			document.addEventListener(CONTEXT_UPDATE, handleUpdate);
			return () => document.removeEventListener(CONTEXT_UPDATE, handleUpdate);
		},
		[],
		subSlot(slot, 'e:update'),
	);

	return createElement(Primitive.div, {
		...layerProps,
		ref: composedRefs,
		style: {
			pointerEvents: isBodyPointerEventsDisabled
				? isPointerEventsEnabled
					? 'auto'
					: 'none'
				: undefined,
			...props.style,
		},
		onFocusCapture: composeEventHandlers(props.onFocusCapture, focusOutside.onFocusCapture),
		onBlurCapture: composeEventHandlers(props.onBlurCapture, focusOutside.onBlurCapture),
		onPointerDownCapture: composeEventHandlers(
			props.onPointerDownCapture,
			pointerDownOutside.onPointerDownCapture,
		),
	});
}

export function DismissableLayerBranch(props: any): any {
	const slot = S('DismissableLayerBranch');
	const { ref: forwardedRef, ...branchProps } = props ?? {};
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	useEffect(
		() => {
			const node = ref.current;
			if (node) {
				layerContext.branches.add(node);
				return () => {
					layerContext.branches.delete(node);
				};
			}
		},
		[],
		subSlot(slot, 'e:branch'),
	);
	return createElement(Primitive.div, { ...branchProps, ref: composedRefs });
}

/** Register an element as a layer's own dismiss affordance (e.g. a dialog overlay). */
export function useDismissableLayerSurface(...args: any[]): (node: HTMLElement | null) => void {
	const slotArg = args[args.length - 1];
	const slot = typeof slotArg === 'symbol' ? slotArg : S('useDismissableLayerSurface');
	const [node, setNode] = useState<HTMLElement | null>(null, subSlot(slot, 'node'));
	useEffect(
		() => {
			if (!node) return;
			layerContext.dismissableSurfaces.add(node);
			return () => {
				layerContext.dismissableSurfaces.delete(node);
			};
		},
		[node],
		subSlot(slot, 'e:surface'),
	);
	return setNode;
}

/**
 * Listens for `pointerdown` outside the layer subtree. Radix's semantics preserved:
 * a capture-phase flag distinguishes inside-the-component-tree pointerdowns (portals
 * included, since octane events bubble the LOGICAL tree) from true outside presses, and
 * `deferPointerDownOutside` waits for the paired `click` so an outside handler that
 * `stopPropagation()`s (an "intercepted" interaction) doesn't dismiss.
 */
function usePointerDownOutside(
	onPointerDownOutside: (event: any) => void,
	args: {
		ownerDocument: Document;
		deferPointerDownOutside: boolean;
		isDeferredPointerDownOutsideRef: { current: boolean };
		dismissableSurfaces: Set<HTMLElement>;
	},
	slot: symbol | undefined,
): { onPointerDownCapture: () => void } {
	const {
		ownerDocument,
		deferPointerDownOutside,
		isDeferredPointerDownOutsideRef,
		dismissableSurfaces,
	} = args;
	const handlePointerDownOutside = useEffectEvent(onPointerDownOutside, subSlot(slot, 'cb'));
	const isPointerInsideReactTreeRef = useRef(false, subSlot(slot, 'inside'));
	const isPointerDownOutsideRef = useRef(false, subSlot(slot, 'outside'));
	const interceptedRef = useRef(new Map<string, boolean>(), subSlot(slot, 'intercepted'));
	const handleClickRef = useRef<() => void>(() => {}, subSlot(slot, 'click'));

	useEffect(
		() => {
			function resetOutsideInteraction(): void {
				isPointerDownOutsideRef.current = false;
				isDeferredPointerDownOutsideRef.current = false;
				interceptedRef.current.clear();
			}
			function isOutsideInteractionIntercepted(): boolean {
				return Array.from(interceptedRef.current.values()).some(Boolean);
			}
			function handleInteractionCapture(event: Event): void {
				if (!isPointerDownOutsideRef.current) return;
				const target = event.target;
				const isDismissableSurface =
					target instanceof Node &&
					[...dismissableSurfaces].some((surface) => surface.contains(target));
				if (!isDismissableSurface) {
					interceptedRef.current.set(event.type, true);
				}
				if (event.type === 'click') {
					window.setTimeout(() => {
						if (isPointerDownOutsideRef.current) {
							handleClickRef.current();
						}
					}, 0);
				}
			}
			function handleInteractionBubble(event: Event): void {
				if (isPointerDownOutsideRef.current) {
					interceptedRef.current.set(event.type, false);
				}
			}
			const handlePointerDown = (event: PointerEvent): void => {
				if (event.target && !isPointerInsideReactTreeRef.current) {
					const eventDetail = { originalEvent: event };
					const handleAndDispatchPointerDownOutsideEvent = (): void => {
						ownerDocument.removeEventListener('click', handleClickRef.current);
						const wasIntercepted = isOutsideInteractionIntercepted();
						resetOutsideInteraction();
						if (!wasIntercepted) {
							handleAndDispatchCustomEvent(
								POINTER_DOWN_OUTSIDE,
								handlePointerDownOutside,
								eventDetail,
								{ discrete: true },
							);
						}
					};
					isPointerDownOutsideRef.current = true;
					isDeferredPointerDownOutsideRef.current = deferPointerDownOutside && event.button === 0;
					interceptedRef.current.clear();
					if (!deferPointerDownOutside || event.button !== 0) {
						handleAndDispatchPointerDownOutsideEvent();
					} else {
						ownerDocument.removeEventListener('click', handleClickRef.current);
						handleClickRef.current = handleAndDispatchPointerDownOutsideEvent;
						ownerDocument.addEventListener('click', handleClickRef.current, { once: true });
					}
				} else {
					ownerDocument.removeEventListener('click', handleClickRef.current);
					resetOutsideInteraction();
				}
				isPointerInsideReactTreeRef.current = false;
			};
			const outsideInteractionEvents = [
				'pointerup',
				'mousedown',
				'mouseup',
				'touchstart',
				'touchend',
				'click',
			];
			for (const eventName of outsideInteractionEvents) {
				ownerDocument.addEventListener(eventName, handleInteractionCapture, true);
				ownerDocument.addEventListener(eventName, handleInteractionBubble);
			}
			// Avoid the open-click itself registering as "outside" (it happened before mount).
			const timerId = window.setTimeout(() => {
				ownerDocument.addEventListener('pointerdown', handlePointerDown as any);
			}, 0);
			return () => {
				window.clearTimeout(timerId);
				ownerDocument.removeEventListener('pointerdown', handlePointerDown as any);
				ownerDocument.removeEventListener('click', handleClickRef.current);
				for (const eventName of outsideInteractionEvents) {
					ownerDocument.removeEventListener(eventName, handleInteractionCapture, true);
					ownerDocument.removeEventListener(eventName, handleInteractionBubble);
				}
			};
		},
		[ownerDocument, deferPointerDownOutside],
		subSlot(slot, 'e:pdo'),
	);

	return {
		// ensures we check the COMPONENT tree (not just DOM tree) — capture on the layer.
		onPointerDownCapture: () => {
			isPointerInsideReactTreeRef.current = true;
		},
	};
}

/** Listens for `focusin` outside the layer subtree. */
function useFocusOutside(
	onFocusOutside: (event: any) => void,
	ownerDocument: Document,
	slot: symbol | undefined,
): { onFocusCapture: () => void; onBlurCapture: () => void } {
	const handleFocusOutside = useEffectEvent(onFocusOutside, subSlot(slot, 'cb'));
	const isFocusInsideReactTreeRef = useRef(false, subSlot(slot, 'inside'));
	useEffect(
		() => {
			const handleFocus = (event: FocusEvent): void => {
				if (event.target && !isFocusInsideReactTreeRef.current) {
					const eventDetail = { originalEvent: event };
					handleAndDispatchCustomEvent(FOCUS_OUTSIDE, handleFocusOutside, eventDetail, {
						discrete: false,
					});
				}
			};
			ownerDocument.addEventListener('focusin', handleFocus);
			return () => ownerDocument.removeEventListener('focusin', handleFocus);
		},
		[ownerDocument],
		subSlot(slot, 'e:fo'),
	);
	return {
		onFocusCapture: () => {
			isFocusInsideReactTreeRef.current = true;
		},
		onBlurCapture: () => {
			isFocusInsideReactTreeRef.current = false;
		},
	};
}

function dispatchUpdate(): void {
	document.dispatchEvent(new CustomEvent(CONTEXT_UPDATE));
}

function handleAndDispatchCustomEvent(
	name: string,
	handler: ((event: any) => void) | undefined,
	detail: { originalEvent: Event },
	{ discrete }: { discrete: boolean },
): void {
	const target = detail.originalEvent.target as EventTarget;
	const event = new CustomEvent(name, { bubbles: false, cancelable: true, detail });
	if (handler) target.addEventListener(name, handler as any, { once: true });
	if (discrete) {
		dispatchDiscreteCustomEvent(target, event);
	} else {
		target.dispatchEvent(event);
	}
}

export { DismissableLayer as Root, DismissableLayerBranch as Branch };
