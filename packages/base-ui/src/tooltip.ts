// Ported from .base-ui/packages/react/src/tooltip/ (v1.6.0): store (TooltipStore/TooltipHandle),
// provider, root (+ TooltipInteractions), trigger, portal, positioner, popup, arrow, viewport.
// Reuses the Store + floating stack built for Dialog/Popover, plus the Phase-3b hover/focus layer
// (a tooltip is hover-first, so `useHoverReferenceInteraction` + `useFocus` + `useDelayGroup` are
// its primary interactions) and the Phase-3c viewport.
//
// octane adaptations: forwardRef → ref-as-prop; native events (so `event.nativeEvent` collapses to
// `event`); every Store hook-method + hook threads an explicit slot; `React.createContext` →
// octane `createContext`.
import { createContext, createElement, Fragment, useContext, useMemo, useRef } from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import { mergeProps } from './utils/mergeProps';
import { useBaseUiId } from './utils/useBaseUiId';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { ReactStore } from './utils/store/ReactStore';
import { createSelector } from './utils/store/createSelector';
import { useTimeout } from './utils/useTimeout';
import { useValueAsRef } from './utils/useValueAsRef';
import { useLayoutEffect, useCallback, useImperativeHandle, isChildrenBlock } from 'octane';
import { useDismiss } from './utils/floating/useDismiss';
import { useClientPoint } from './utils/floating/useClientPoint';
import { useFocus } from './utils/floating/useFocus';
import { FloatingDelayGroup, useDelayGroup } from './utils/floating/FloatingDelayGroup';
import {
	safePolygon,
	useHoverReferenceInteraction,
} from './utils/floating/useHoverReferenceInteraction';
import { useHoverFloatingInteraction } from './utils/floating/useHoverFloatingInteraction';
import { useHoverInteractionSharedState } from './utils/floating/useHoverInteractionSharedState';
import { contains } from './utils/floating/element';
import { isMouseLikePointerType } from './utils/floating/event';
import { isElement } from './utils/dom';
import { FloatingPortalLite } from './utils/FloatingPortalLite';
import {
	useAnchorPositioning,
	type Side,
	type Align,
	type UseAnchorPositioningSharedParameters,
} from './utils/useAnchorPositioning';
import { usePositioner } from './utils/usePositioner';
import { usePopupViewport } from './utils/usePopupViewport';
import { adaptiveOrigin } from './utils/adaptiveOriginMiddleware';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';
import { getDisabledMountTransitionStyles } from './utils/getDisabledMountTransitionStyles';
import { POPUP_COLLISION_AVOIDANCE } from './utils/constants';
import {
	popupStateMapping,
	triggerOpenStateMapping,
	CommonTriggerDataAttributes,
} from './utils/popupStateMapping';
import { transitionStatusMapping } from './utils/useTransitionStatus';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import {
	createInitialPopupStoreState,
	createPopupFloatingRootContext,
	popupStoreSelectors,
	applyPopupOpenChange,
	usePopupStore,
	useInitialOpenSync,
	useImplicitActiveTrigger,
	useOpenStateTransitions,
	usePopupInteractionProps,
	useTriggerDataForwarding,
	FOCUSABLE_POPUP_PROPS,
	type PopupStoreState,
	type PopupStoreContext,
} from './utils/popups';
import { PopupTriggerMap } from './utils/popups/popupTriggerMap';

export const OPEN_DELAY = 600;

const TOOLTIP_TRIGGER_IDENTIFIER = 'data-base-ui-tooltip-trigger';

export const TooltipTriggerDataAttributes = {
	popupOpen: CommonTriggerDataAttributes.popupOpen,
	triggerDisabled: 'data-trigger-disabled',
} as const;

export const TooltipViewportCssVars = {
	popupWidth: '--popup-width',
	popupHeight: '--popup-height',
} as const;

// --- Store -------------------------------------------------------------------

export type TooltipState<Payload> = PopupStoreState<Payload> & {
	disabled: boolean;
	instantType: 'delay' | 'dismiss' | 'focus' | undefined;
	isInstantPhase: boolean;
	trackCursorAxis: 'none' | 'x' | 'y' | 'both';
	disableHoverablePopup: boolean;
	openChangeReason: string | null;
	closeOnClick: boolean;
	closeDelay: number;
	hasViewport: boolean;
};

type TooltipContext = PopupStoreContext<any> & {
	readonly popupRef: { current: HTMLElement | null };
};

const tooltipSelectors = {
	...popupStoreSelectors,
	disabled: createSelector((state: TooltipState<unknown>) => state.disabled),
	instantType: createSelector((state: TooltipState<unknown>) => state.instantType),
	isInstantPhase: createSelector((state: TooltipState<unknown>) => state.isInstantPhase),
	trackCursorAxis: createSelector((state: TooltipState<unknown>) => state.trackCursorAxis),
	disableHoverablePopup: createSelector(
		(state: TooltipState<unknown>) => state.disableHoverablePopup,
	),
	lastOpenChangeReason: createSelector((state: TooltipState<unknown>) => state.openChangeReason),
	closeOnClick: createSelector((state: TooltipState<unknown>) => state.closeOnClick),
	closeDelay: createSelector((state: TooltipState<unknown>) => state.closeDelay),
	hasViewport: createSelector((state: TooltipState<unknown>) => state.hasViewport),
};

function createInitialTooltipState<Payload>(): TooltipState<Payload> {
	return {
		...createInitialPopupStoreState<Payload>(),
		disabled: false,
		instantType: undefined,
		isInstantPhase: false,
		trackCursorAxis: 'none',
		disableHoverablePopup: false,
		openChangeReason: null,
		closeOnClick: true,
		closeDelay: 0,
		hasViewport: false,
	};
}

export class TooltipStore<Payload> extends ReactStore<
	Readonly<TooltipState<Payload>>,
	TooltipContext,
	typeof tooltipSelectors
> {
	constructor(
		initialState?: Partial<TooltipState<Payload>>,
		floatingId?: string | undefined,
		nested = false,
	) {
		const triggerElements = new PopupTriggerMap();
		const state = { ...createInitialTooltipState<Payload>(), ...initialState };
		state.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);

		super(
			state,
			{
				popupRef: { current: null },
				onOpenChange: undefined,
				onOpenChangeComplete: undefined,
				triggerElements,
			} as TooltipContext,
			tooltipSelectors,
		);
	}

	setOpen = (nextOpen: boolean, eventDetails: any) => {
		applyPopupOpenChange(this as any, nextOpen, eventDetails, {
			extraState: { openChangeReason: eventDetails.reason } as any,
		});
	};

	// Used by trigger clicks to clear a delayed hover open without reporting a public state change.
	cancelPendingOpen(event: MouseEvent | PointerEvent): void {
		(this.state.floatingRootContext as any).dispatchOpenChange(
			false,
			createChangeEventDetails(REASONS.triggerPress, event),
		);
	}

	static useStore<Payload>(
		externalStore: TooltipStore<Payload> | undefined,
		initialState: Partial<TooltipState<Payload>>,
		slot: symbol | undefined,
	): TooltipStore<Payload> {
		return usePopupStore(
			externalStore as any,
			(floatingId, nested) => new TooltipStore<Payload>(initialState, floatingId, nested) as any,
			true,
			slot,
		).store as unknown as TooltipStore<Payload>;
	}
}

// --- Handle ------------------------------------------------------------------

export class TooltipHandle<Payload> {
	readonly store: TooltipStore<Payload>;

	constructor(store?: TooltipStore<Payload>) {
		this.store = store ?? new TooltipStore<Payload>();
	}

	open(triggerId: string): void {
		const triggerElement = triggerId
			? (this.store.context.triggerElements.getById(triggerId) as HTMLElement | undefined)
			: undefined;

		if (triggerId && !triggerElement) {
			throw new Error(`Base UI: TooltipHandle.open: No trigger found with id "${triggerId}".`);
		}

		this.store.setOpen(
			true,
			createChangeEventDetails(REASONS.imperativeAction, undefined, triggerElement),
		);
	}

	close(): void {
		this.store.setOpen(
			false,
			createChangeEventDetails(REASONS.imperativeAction, undefined, undefined),
		);
	}

	get isOpen(): boolean {
		return this.store.select('open');
	}
}

export function createTooltipHandle<Payload = unknown>(): TooltipHandle<Payload> {
	return new TooltipHandle<Payload>();
}

// --- Contexts ----------------------------------------------------------------

const TooltipRootContext = createContext<TooltipStore<any> | undefined>(undefined);

export function useTooltipRootContext(optional?: boolean): TooltipStore<any> | undefined {
	const context = useContext(TooltipRootContext);
	if (context === undefined && !optional) {
		throw new Error(
			'Base UI: TooltipRootContext is missing. Tooltip parts must be placed within <Tooltip.Root>.',
		);
	}
	return context;
}

interface TooltipProviderContextValue {
	delay: number | undefined;
	closeDelay: number | undefined;
}

const TooltipProviderContext = createContext<TooltipProviderContextValue | undefined>(undefined);

function useTooltipProviderContext(): TooltipProviderContextValue | undefined {
	return useContext(TooltipProviderContext);
}

const TooltipPortalContext = createContext<boolean | undefined>(undefined);

function useTooltipPortalContext(): boolean {
	const value = useContext(TooltipPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <Tooltip.Portal> is missing.');
	}
	return value;
}

export interface TooltipPositionerContextValue {
	side: Side;
	align: Align;
	arrowRef: { current: Element | null };
	arrowUncentered: boolean;
	arrowStyles: Record<string, any>;
}

const TooltipPositionerContext = createContext<TooltipPositionerContextValue | undefined>(
	undefined,
);

export function useTooltipPositionerContext(): TooltipPositionerContextValue {
	const context = useContext(TooltipPositionerContext);
	if (!context) {
		throw new Error(
			'Base UI: TooltipPositionerContext is missing. TooltipPositioner parts must be placed within <Tooltip.Positioner>.',
		);
	}
	return context;
}

// --- Provider ----------------------------------------------------------------

// Shares one delay across a group of tooltips: once one is visible, its neighbours open instantly.
function TooltipProvider(props: any): any {
	const slot = S('TooltipProvider');
	const { delay, closeDelay, timeout = 400, children } = props;

	const contextValue = useMemo(
		() => ({ delay, closeDelay }),
		[delay, closeDelay],
		subSlot(slot, 'ctx'),
	);

	const delayValue = useMemo(
		() => ({ open: delay, close: closeDelay }),
		[delay, closeDelay],
		subSlot(slot, 'delay'),
	);

	return createElement(TooltipProviderContext.Provider, {
		value: contextValue,
		children: createElement(FloatingDelayGroup, {
			delay: delayValue as any,
			timeoutMs: timeout,
			children,
		}),
	});
}

// --- Interactions ------------------------------------------------------------

function TooltipInteractions(props: any): any {
	const slot = S('TooltipInteractions');
	const { store, disabled, trackCursorAxis } = props;

	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));

	const dismiss = useDismiss(
		floatingRootContext,
		{ enabled: !disabled, referencePress: () => store.select('closeOnClick') },
		subSlot(slot, 'dismiss'),
	);
	const clientPoint = useClientPoint(
		floatingRootContext,
		{
			enabled: !disabled && trackCursorAxis !== 'none',
			axis: trackCursorAxis === 'none' ? undefined : trackCursorAxis,
		},
		subSlot(slot, 'cp'),
	);

	const activeTriggerProps = useMemo(
		() => mergeProps(clientPoint.reference, dismiss.reference),
		[clientPoint.reference, dismiss.reference],
		subSlot(slot, 'atp'),
	);
	const inactiveTriggerProps = useMemo(
		() => mergeProps(clientPoint.trigger, dismiss.trigger),
		[clientPoint.trigger, dismiss.trigger],
		subSlot(slot, 'itp'),
	);
	const popupProps = useMemo(
		() => mergeProps(FOCUSABLE_POPUP_PROPS, clientPoint.floating, dismiss.floating),
		[clientPoint.floating, dismiss.floating],
		subSlot(slot, 'pp'),
	);

	usePopupInteractionProps(
		store,
		{ activeTriggerProps, inactiveTriggerProps, popupProps } as any,
		subSlot(slot, 'pip'),
	);

	return null;
}

// --- Root --------------------------------------------------------------------

function TooltipRoot<Payload = unknown>(props: any): any {
	const slot = S('TooltipRoot');
	const {
		disabled = false,
		defaultOpen = false,
		open: openProp,
		disableHoverablePopup = false,
		trackCursorAxis = 'none',
		actionsRef,
		onOpenChange,
		onOpenChangeComplete,
		handle,
		triggerId: triggerIdProp,
		defaultTriggerId: defaultTriggerIdProp = null,
		children,
	} = props;

	const store = TooltipStore.useStore<Payload>(
		handle?.store,
		{
			open: defaultOpen,
			openProp,
			activeTriggerId: defaultTriggerIdProp,
			triggerIdProp,
		} as any,
		subSlot(slot, 'store'),
	);

	useInitialOpenSync(store, openProp, defaultOpen, defaultTriggerIdProp, subSlot(slot, 'ios'));

	store.useControlledProp('openProp', openProp, subSlot(slot, 'cp:open'));
	store.useControlledProp('triggerIdProp', triggerIdProp, subSlot(slot, 'cp:trigger'));

	store.useContextCallback('onOpenChange', onOpenChange, subSlot(slot, 'cb:open'));
	store.useContextCallback(
		'onOpenChangeComplete',
		onOpenChangeComplete,
		subSlot(slot, 'cb:complete'),
	);

	const openState = store.useState('open', subSlot(slot, 'open'));
	const open = !disabled && openState;

	const activeTriggerId = store.useState('activeTriggerId', subSlot(slot, 'atid'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const payload = store.useState('payload', subSlot(slot, 'payload'));

	store.useSyncedValue('trackCursorAxis', trackCursorAxis, subSlot(slot, 'sv:tca'));
	store.useSyncedValue('disableHoverablePopup', disableHoverablePopup, subSlot(slot, 'sv:dhp'));
	store.useSyncedValue('disabled', disabled, subSlot(slot, 'sv:disabled'));

	useImplicitActiveTrigger(store, { closeOnActiveTriggerUnmount: true }, subSlot(slot, 'implicit'));
	const { forceUnmount, transitionStatus } = useOpenStateTransitions(
		open,
		store as any,
		undefined,
		subSlot(slot, 'transitions'),
	);
	const isInstantPhase = store.useState('isInstantPhase', subSlot(slot, 'iip'));
	const instantType = store.useState('instantType', subSlot(slot, 'itype'));
	const lastOpenChangeReason = store.useState('lastOpenChangeReason', subSlot(slot, 'locr'));

	const previousInstantTypeRef = useRef<string | undefined | null>(null, subSlot(slot, 'pit'));

	useLayoutEffect(
		() => {
			if (openState && disabled) {
				store.setOpen(false, createChangeEventDetails(REASONS.disabled));
			}
		},
		[openState, disabled, store],
		subSlot(slot, 'l:disabled'),
	);

	// Animations are instant in two cases: opening during the provider's instant phase (an adjacent
	// tooltip took over), and closing because another tooltip opened (reason === 'none'). Otherwise
	// the animation plays — in particular, the 'ending' phase is NOT made instant unless a sibling
	// caused it.
	useLayoutEffect(
		() => {
			if (
				(transitionStatus === 'ending' && lastOpenChangeReason === REASONS.none) ||
				(transitionStatus !== 'ending' && isInstantPhase)
			) {
				if (instantType !== 'delay') {
					previousInstantTypeRef.current = instantType;
				}
				store.set('instantType', 'delay');
			} else if (previousInstantTypeRef.current !== null) {
				store.set('instantType', previousInstantTypeRef.current);
				previousInstantTypeRef.current = null;
			}
		},
		[transitionStatus, isInstantPhase, lastOpenChangeReason, instantType, store],
		subSlot(slot, 'l:instant'),
	);

	useLayoutEffect(
		() => {
			if (open && activeTriggerId == null) {
				store.set('payload', undefined);
			}
		},
		[store, activeTriggerId, open],
		subSlot(slot, 'l:payload'),
	);

	const handleImperativeClose = useCallback(
		() => {
			store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction));
		},
		[store],
		subSlot(slot, 'close'),
	);

	useImperativeHandle(
		actionsRef,
		() => ({ unmount: forceUnmount, close: handleImperativeClose }),
		[forceUnmount, handleImperativeClose],
		subSlot(slot, 'imp'),
	);

	const shouldRenderInteractions = open || mounted || (!disabled && trackCursorAxis !== 'none');

	const resolvedChildren =
		typeof children === 'function' && !isChildrenBlock(children) ? children({ payload }) : children;

	// `TooltipInteractions` is a headless SIBLING of the children, exactly as Base UI renders it.
	const content = [
		shouldRenderInteractions
			? createElement(TooltipInteractions, {
					key: 'interactions',
					store,
					disabled,
					trackCursorAxis,
				})
			: null,
		createElement(Fragment, { key: 'children', children: resolvedChildren }),
	];

	return createElement(TooltipRootContext.Provider, { value: store, children: content });
}

// --- Trigger -----------------------------------------------------------------

function getTargetElement(event: Event): Element | null {
	if ('composedPath' in event) {
		const path = event.composedPath();
		for (let i = 0; i < path.length; i += 1) {
			const element = path[i];
			if (isElement(element)) {
				return element as Element;
			}
		}
	}
	const target = event.target;
	if (isElement(target)) {
		return target as Element;
	}
	return null;
}

function closestEnabledTooltipTrigger(element: Element | null): Element | null {
	let current = element;
	while (current) {
		if (current.hasAttribute(TOOLTIP_TRIGGER_IDENTIFIER)) {
			return current;
		}

		const parentElement = current.parentElement;
		if (parentElement) {
			current = parentElement;
			continue;
		}

		const root = current.getRootNode();
		current =
			'host' in root && isElement((root as ShadowRoot).host) ? (root as ShadowRoot).host : null;
	}
	return null;
}

function TooltipTrigger(componentProps: any): any {
	const slot = S('TooltipTrigger');
	const {
		render,
		className,
		style,
		handle,
		payload,
		disabled: disabledProp,
		delay,
		closeOnClick = true,
		closeDelay,
		id: idProp,
		ref,
		...elementProps
	} = componentProps;

	const rootContext = useTooltipRootContext(true);
	const store = (handle?.store ?? rootContext) as TooltipStore<any> | undefined;
	if (!store) {
		throw new Error(
			'Base UI: <Tooltip.Trigger> must be either used within a <Tooltip.Root> component or provided with a handle.',
		);
	}

	const thisTriggerId = useBaseUiId(idProp, subSlot(slot, 'id'));
	const isTriggerActive = store.useState('isTriggerActive', subSlot(slot, 'ita'), thisTriggerId);
	const isOpenedByThisTrigger = store.useState(
		'isOpenedByTrigger',
		subSlot(slot, 'obt'),
		thisTriggerId,
	);
	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));

	const triggerElementRef = useRef<Element | null>(null, subSlot(slot, 'trigEl'));

	const delayWithDefault = delay ?? OPEN_DELAY;
	const closeDelayWithDefault = closeDelay ?? 0;

	const { registerTrigger, isMountedByThisTrigger } = useTriggerDataForwarding(
		thisTriggerId,
		triggerElementRef,
		store,
		{ payload, closeOnClick, closeDelay: closeDelayWithDefault },
		subSlot(slot, 'tdf'),
	);

	const providerContext = useTooltipProviderContext();
	const { delayRef, isInstantPhase, hasProvider } = useDelayGroup(
		floatingRootContext,
		{ open: isOpenedByThisTrigger },
		subSlot(slot, 'group'),
	);
	const hoverInteraction = useHoverInteractionSharedState(
		floatingRootContext,
		subSlot(slot, 'hoverState'),
	);

	store.useSyncedValue('isInstantPhase', isInstantPhase, subSlot(slot, 'sv:iip'));

	const rootDisabled = store.useState('disabled', subSlot(slot, 'rootDisabled'));
	const disabled = disabledProp ?? rootDisabled;
	const disabledRef = useValueAsRef<boolean>(disabled, subSlot(slot, 'disabledRef'));
	const trackCursorAxis = store.useState('trackCursorAxis', subSlot(slot, 'tca'));
	const disableHoverablePopup = store.useState('disableHoverablePopup', subSlot(slot, 'dhp'));

	const isNestedTriggerHoveredRef = useRef(false, subSlot(slot, 'nested'));
	const nestedTriggerOpenTimeout = useTimeout(subSlot(slot, 'nestedTo'));
	// A local copy, so `mouseleave` can clear it without resetting the hover hook's own pointerType.
	const pointerTypeRef = useRef<string | undefined>(undefined, subSlot(slot, 'ptype'));

	function getOpenDelay(): number {
		const providerDelay = providerContext?.delay;
		const groupOpenValue = typeof delayRef.current === 'object' ? delayRef.current.open : undefined;

		let computedOpenDelay = delayWithDefault;
		if (hasProvider) {
			if (groupOpenValue !== 0) {
				computedOpenDelay = delay ?? providerDelay ?? delayWithDefault;
			} else {
				computedOpenDelay = 0;
			}
		}
		return computedOpenDelay;
	}

	function isEnabledNestedTriggerTarget(target: Element | null): boolean {
		const triggerEl = triggerElementRef.current;
		if (!triggerEl || !target) {
			return false;
		}
		const nearestTrigger = closestEnabledTooltipTrigger(target);
		return (
			nearestTrigger !== null && nearestTrigger !== triggerEl && contains(triggerEl, nearestTrigger)
		);
	}

	function detectNestedTriggerHover(target: Element | null): boolean {
		const nestedTriggerHovered = isEnabledNestedTriggerTarget(target);

		isNestedTriggerHoveredRef.current = nestedTriggerHovered;
		if (nestedTriggerHovered) {
			hoverInteraction.openChangeTimeout.clear();
			hoverInteraction.restTimeout.clear();
			hoverInteraction.restTimeoutPending = false;
			nestedTriggerOpenTimeout.clear();
		}
		return nestedTriggerHovered;
	}

	const hoverProps = useHoverReferenceInteraction(
		floatingRootContext,
		{
			enabled: !disabled,
			mouseOnly: true,
			move: false,
			handleClose: !disableHoverablePopup && trackCursorAxis !== 'both' ? safePolygon() : null,
			restMs: getOpenDelay,
			delay() {
				const closeValue =
					typeof delayRef.current === 'object' ? delayRef.current.close : undefined;

				let computedCloseDelay: number | undefined = closeDelayWithDefault;
				if (closeDelay == null && hasProvider) {
					computedCloseDelay = closeValue;
				}
				return { close: computedCloseDelay } as any;
			},
			triggerElementRef,
			isActiveTrigger: isTriggerActive,
			isClosing: () => store.select('transitionStatus') === 'ending',
			shouldOpen() {
				return !isNestedTriggerHoveredRef.current;
			},
		},
		subSlot(slot, 'hover'),
	);

	const focusProps = useFocus(
		floatingRootContext,
		{ enabled: !disabled },
		subSlot(slot, 'focus'),
	).reference;

	function handleNestedTriggerHover(event: MouseEvent): void {
		const wasNestedTriggerHovered = isNestedTriggerHoveredRef.current;
		const target = getTargetElement(event);
		const nestedTriggerHovered = detectNestedTriggerHover(target);
		const triggerEl = triggerElementRef.current as HTMLElement | null;
		const targetInsideTrigger = triggerEl && target && contains(triggerEl, target);

		// Only close hover-opened parents. Focus/click-like opens stay owned by their original
		// interaction and must not be clobbered by a nested hover.
		if (
			nestedTriggerHovered &&
			store!.select('open') &&
			store!.select('lastOpenChangeReason') === REASONS.triggerHover
		) {
			store!.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
			return;
		}

		if (
			wasNestedTriggerHovered &&
			!nestedTriggerHovered &&
			targetInsideTrigger &&
			!disabledRef.current &&
			!store!.select('open') &&
			triggerEl &&
			// Match the hover hook's non-strict mouse fallback for mouse-only event sequences.
			isMouseLikePointerType(pointerTypeRef.current)
		) {
			const openTooltip = () => {
				if (!isNestedTriggerHoveredRef.current && !disabledRef.current && !store!.select('open')) {
					store!.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, triggerEl));
				}
			};

			const openDelay = getOpenDelay();

			// With `move: false` the hover hook only listens to mouseenter/mouseleave on the parent
			// trigger, so leaving a nested child for the parent area fires nothing it can react to.
			// Reopen locally instead.
			if (openDelay === 0) {
				nestedTriggerOpenTimeout.clear();
				openTooltip();
			} else {
				nestedTriggerOpenTimeout.start(openDelay, openTooltip);
			}
		}
	}

	const rootTriggerProps = store.useState(
		'triggerProps',
		subSlot(slot, 'tp'),
		isMountedByThisTrigger,
	);
	const shouldApplyRootTriggerProps = isMountedByThisTrigger || trackCursorAxis !== 'none';

	const state = { open: isOpenedByThisTrigger };

	return useRenderElement(
		'button',
		{ render, className, style },
		{
			state,
			ref: [ref, registerTrigger, triggerElementRef],
			props: [
				hoverProps,
				focusProps,
				shouldApplyRootTriggerProps ? rootTriggerProps : undefined,
				{
					onMouseOver(event: MouseEvent) {
						handleNestedTriggerHover(event);
					},
					onFocus(event: FocusEvent) {
						if (isEnabledNestedTriggerTarget(getTargetElement(event))) {
							(event as any).preventBaseUIHandler?.();
						}
					},
					onMouseLeave() {
						isNestedTriggerHoveredRef.current = false;
						nestedTriggerOpenTimeout.clear();
						pointerTypeRef.current = undefined;
					},
					onPointerEnter(event: PointerEvent) {
						pointerTypeRef.current = event.pointerType;
					},
					onPointerDown(event: PointerEvent) {
						pointerTypeRef.current = event.pointerType;
						store!.set('closeOnClick', closeOnClick);
						if (closeOnClick && !store!.select('open')) {
							store!.cancelPendingOpen(event);
						}
					},
					onClick(event: MouseEvent) {
						if (closeOnClick && !store!.select('open')) {
							store!.cancelPendingOpen(event);
						}
					},
					id: thisTriggerId,
					[TooltipTriggerDataAttributes.triggerDisabled]: disabled ? '' : undefined,
					[TOOLTIP_TRIGGER_IDENTIFIER]: disabled ? undefined : '',
				},
				elementProps,
			],
			stateAttributesMapping: triggerOpenStateMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Portal ------------------------------------------------------------------

function TooltipPortal(props: any): any {
	const slot = S('TooltipPortal');
	const { keepMounted = false, ref, ...portalProps } = props;

	const store = useTooltipRootContext() as TooltipStore<any>;
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));

	if (!(mounted || keepMounted)) {
		return null;
	}

	return createElement(TooltipPortalContext.Provider, {
		value: keepMounted,
		children: createElement(FloatingPortalLite, { ref, ...portalProps }),
	});
}

// --- Positioner --------------------------------------------------------------

function TooltipPositioner(componentProps: any): any {
	const slot = S('TooltipPositioner');
	const {
		render,
		className,
		style,
		anchor,
		positionMethod = 'absolute',
		side = 'top',
		align = 'center',
		sideOffset = 0,
		alignOffset = 0,
		collisionBoundary = 'clipping-ancestors',
		collisionPadding = 5,
		arrowPadding = 5,
		sticky = false,
		disableAnchorTracking = false,
		collisionAvoidance = POPUP_COLLISION_AVOIDANCE,
		ref,
		...elementProps
	} = componentProps;

	const store = useTooltipRootContext() as TooltipStore<any>;
	const keepMounted = useTooltipPortalContext();

	const open = store.useState('open', subSlot(slot, 'open'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const trackCursorAxis = store.useState('trackCursorAxis', subSlot(slot, 'tca'));
	const disableHoverablePopup = store.useState('disableHoverablePopup', subSlot(slot, 'dhp'));
	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const instantType = store.useState('instantType', subSlot(slot, 'instant'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const hasViewport = store.useState('hasViewport', subSlot(slot, 'viewport'));

	const positioning = useAnchorPositioning(
		{
			anchor,
			positionMethod,
			floatingRootContext,
			mounted,
			side,
			sideOffset,
			align,
			alignOffset,
			collisionBoundary,
			collisionPadding,
			sticky,
			arrowPadding,
			disableAnchorTracking,
			keepMounted,
			collisionAvoidance,
			adaptiveOrigin: hasViewport ? adaptiveOrigin : undefined,
		},
		subSlot(slot, 'pos'),
	);

	const state = useMemo(
		() => ({
			open,
			side: positioning.side,
			align: positioning.align,
			anchorHidden: positioning.anchorHidden,
			instant: trackCursorAxis !== 'none' ? 'tracking-cursor' : instantType,
		}),
		[
			open,
			positioning.side,
			positioning.align,
			positioning.anchorHidden,
			trackCursorAxis,
			instantType,
		],
		subSlot(slot, 'state'),
	);

	const setPositionerElement = store.useStateSetter('positionerElement', subSlot(slot, 'spe'));

	const element = usePositioner(
		{ render, className, style },
		state,
		{
			styles: positioning.positionerStyles,
			transitionStatus,
			props: elementProps,
			refs: [ref, setPositionerElement],
			hidden: !mounted,
			inert: !open || trackCursorAxis === 'both' || disableHoverablePopup,
		},
		subSlot(slot, 'positioner'),
	);

	return createElement(TooltipPositionerContext.Provider, {
		value: positioning as TooltipPositionerContextValue,
		children: element,
	});
}

// --- Popup -------------------------------------------------------------------

const popupStateAttributesMapping: StateAttributesMapping<any> = {
	...(popupStateMapping as StateAttributesMapping<any>),
	...(transitionStatusMapping as StateAttributesMapping<any>),
};

function TooltipPopup(componentProps: any): any {
	const slot = S('TooltipPopup');
	const { render, className, style, ref, ...elementProps } = componentProps;

	const store = useTooltipRootContext() as TooltipStore<any>;
	const { side, align } = useTooltipPositionerContext();

	const open = store.useState('open', subSlot(slot, 'open'));
	const instantType = store.useState('instantType', subSlot(slot, 'instant'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const popupProps = store.useState('popupProps', subSlot(slot, 'pp'));
	const floatingContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const disabled = store.useState('disabled', subSlot(slot, 'disabled'));
	const closeDelay = store.useState('closeDelay', subSlot(slot, 'closeDelay'));

	useOpenChangeComplete(
		{
			open,
			ref: store.context.popupRef,
			onComplete() {
				if (open) {
					store.context.onOpenChangeComplete?.(true);
				}
			},
		},
		subSlot(slot, 'occ'),
	);

	useHoverFloatingInteraction(
		floatingContext,
		{ enabled: !disabled, closeDelay },
		subSlot(slot, 'hoverPopup'),
	);

	const setPopupElement = store.useStateSetter('popupElement', subSlot(slot, 'spe'));

	const state = { open, side, align, instant: instantType, transitionStatus };

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [ref, store.context.popupRef, setPopupElement],
			props: [popupProps, getDisabledMountTransitionStyles(transitionStatus), elementProps],
			stateAttributesMapping: popupStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Arrow -------------------------------------------------------------------

function TooltipArrow(componentProps: any): any {
	const slot = S('TooltipArrow');
	const { render, className, style, ref, ...elementProps } = componentProps;

	const store = useTooltipRootContext() as TooltipStore<any>;
	const { arrowRef, side, align, arrowUncentered, arrowStyles } = useTooltipPositionerContext();

	const open = store.useState('open', subSlot(slot, 'open'));
	const instantType = store.useState('instantType', subSlot(slot, 'instant'));

	const state = { open, side, align, uncentered: arrowUncentered, instant: instantType };

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [ref, arrowRef],
			props: [{ style: arrowStyles, 'aria-hidden': true }, elementProps],
			stateAttributesMapping: popupStateMapping as StateAttributesMapping<any>,
		},
		subSlot(slot, 're'),
	);
}

// --- Viewport ----------------------------------------------------------------

const viewportStateAttributesMapping: StateAttributesMapping<any> = {
	activationDirection: (value: string | undefined) =>
		value ? { 'data-activation-direction': value } : null,
};

function TooltipViewport(componentProps: any): any {
	const slot = S('TooltipViewport');
	const { render, className, style, children, ref, ...elementProps } = componentProps;

	const store = useTooltipRootContext() as TooltipStore<any>;
	const positioner = useTooltipPositionerContext();

	const instantType = store.useState('instantType', subSlot(slot, 'instant'));

	const { children: childrenToRender, state: viewportState } = usePopupViewport(
		{ store, side: positioner.side, cssVars: TooltipViewportCssVars, children },
		subSlot(slot, 'vp'),
	);

	const state = {
		activationDirection: viewportState.activationDirection,
		transitioning: viewportState.transitioning,
		instant: instantType,
	};

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: [elementProps, { children: childrenToRender }],
			stateAttributesMapping: viewportStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Namespace ---------------------------------------------------------------

export const Tooltip = {
	Provider: TooltipProvider,
	Root: TooltipRoot,
	Trigger: TooltipTrigger,
	Portal: TooltipPortal,
	Positioner: TooltipPositioner,
	Popup: TooltipPopup,
	Arrow: TooltipArrow,
	Viewport: TooltipViewport,
	createHandle: createTooltipHandle,
	Handle: TooltipHandle,
};
