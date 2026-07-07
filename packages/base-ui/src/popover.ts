// Ported from .base-ui/packages/react/src/popover/ (v1.6.0): store (PopoverStore/PopoverHandle),
// root (context/PopoverRoot/PopoverInteractions), trigger. The CLOSED-state path (Root + Trigger),
// reusing the Store + floating stack from Dialog. octane adaptations: forwardRef → ref-as-prop;
// native events; every Store hook-method + hook threads an explicit slot; `React.createContext` →
// octane `createContext`; `ReactDOM.flushSync` → octane `flushSync`.
//
// STUBBED/DEFERRED (behind off-by-default features): `useHoverReferenceInteraction` (openOnHover);
// the Positioner + Popup + Arrow + Backdrop + Title/Description/Close parts (the open path) land next
// with `useAnchorPositioning`. Interactions are only mounted when `open || mounted`, and — as with
// Dialog — a stable no-DOM descriptor wraps the children (octane Provider children shape-flip bug).
import {
	createContext,
	createElement,
	useContext,
	useMemo,
	useRef,
	useEffect,
	useLayoutEffect,
	useCallback,
	useImperativeHandle,
	isChildrenBlock,
	flushSync,
} from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import { mergeProps } from './utils/mergeProps';
import { useButton } from './utils/useButton';
import { useBaseUiId } from './utils/useBaseUiId';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { EMPTY_OBJECT } from './utils/empty';
import { ReactStore } from './utils/store/ReactStore';
import { createSelector } from './utils/store/createSelector';
import { Timeout } from './utils/useTimeout';
import { useClick } from './utils/floating/useClick';
import { useDismiss } from './utils/floating/useDismiss';
import { FocusGuard } from './utils/floating/FocusGuard';
import {
	FloatingTree,
	FloatingNode,
	useFloatingParentNodeId,
	useFloatingNodeId,
} from './utils/floating/FloatingTree';
import { FloatingFocusManager } from './utils/floating/FloatingFocusManager';
import { FloatingPortal } from './utils/floating/FloatingPortal';
import { useHoverFloatingInteraction } from './utils/floating/useHoverFloatingInteraction';
import {
	useAnchorPositioning,
	type Side,
	type Align,
	type UseAnchorPositioningSharedParameters,
} from './utils/useAnchorPositioning';
import { usePositioner } from './utils/usePositioner';
import { useAnchoredPopupScrollLock } from './utils/useAnchoredPopupScrollLock';
import { adaptiveOrigin } from './utils/adaptiveOriginMiddleware';
import { InternalBackdrop } from './utils/InternalBackdrop';
import { useAnimationsFinished } from './utils/useAnimationsFinished';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';
import { getDisabledMountTransitionStyles } from './utils/getDisabledMountTransitionStyles';
import { POPUP_COLLISION_AVOIDANCE } from './utils/constants';
import { ClosePartProvider, useClosePartCount, useClosePartRegistration } from './utils/closePart';
import { popupStateMapping } from './utils/popupStateMapping';
import { transitionStatusMapping } from './utils/useTransitionStatus';
import { COMPOSITE_KEYS } from './utils/composite/keys';
import { inertValue } from './utils/inertValue';
import { isHTMLElement } from './utils/dom';
import {
	safePolygon,
	useHoverReferenceInteraction,
} from './utils/floating/useHoverReferenceInteraction';
import { useOpenMethodTriggerProps } from './utils/useOpenInteractionType';
import {
	triggerOpenStateMapping,
	pressableTriggerOpenStateMapping,
} from './utils/popupStateMapping';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import {
	createInitialPopupStoreState,
	createPopupFloatingRootContext,
	popupStoreSelectors,
	setPopupOpenState,
	attachPreventUnmountOnClose,
	usePopupStore,
	useInitialOpenSync,
	useImplicitActiveTrigger,
	useOpenStateTransitions,
	usePopupRootSync,
	usePopupInteractionProps,
	useTriggerDataForwarding,
	FOCUSABLE_POPUP_PROPS,
	createDefaultInitialFocus,
	type PopupStoreState,
	type PopupStoreContext,
} from './utils/popups';
import { useTriggerFocusGuards } from './utils/popups/useTriggerFocusGuards';
import { PopupTriggerMap } from './utils/popups/popupTriggerMap';
import type { InteractionType } from './utils/useEnhancedClickHandler';

const OPEN_DELAY = 300;
const PATIENT_CLICK_THRESHOLD = 500;
const CLICK_TRIGGER_IDENTIFIER = 'data-base-ui-click-trigger';

// --- Store -------------------------------------------------------------------

export type PopoverState<Payload> = PopupStoreState<Payload> & {
	disabled: boolean;
	instantType: 'dismiss' | 'click' | 'focus' | 'trigger-change' | undefined;
	modal: boolean | 'trap-focus';
	focusManagerModal: boolean;
	openMethod: InteractionType | null;
	openChangeReason: string | null;
	stickIfOpen: boolean;
	nested: boolean;
	titleElementId: string | undefined;
	descriptionElementId: string | undefined;
	openOnHover: boolean;
	closeDelay: number;
	hasViewport: boolean;
};

type PopoverContext = PopupStoreContext<any> & {
	readonly popupRef: { current: HTMLElement | null };
	readonly backdropRef: { current: HTMLDivElement | null };
	readonly internalBackdropRef: { current: HTMLDivElement | null };
	readonly triggerFocusTargetRef: { current: HTMLElement | null };
	readonly beforeContentFocusGuardRef: { current: HTMLElement | null };
	readonly stickIfOpenTimeout: Timeout;
};

function createInitialPopoverState<Payload>(): PopoverState<Payload> {
	return {
		...createInitialPopupStoreState<Payload>(),
		disabled: false,
		modal: false,
		focusManagerModal: false,
		instantType: undefined,
		openMethod: null,
		openChangeReason: null,
		titleElementId: undefined,
		descriptionElementId: undefined,
		stickIfOpen: true,
		nested: false,
		openOnHover: false,
		closeDelay: 0,
		hasViewport: false,
	};
}

const popoverSelectors = {
	...popupStoreSelectors,
	disabled: createSelector((state: PopoverState<unknown>) => state.disabled),
	instantType: createSelector((state: PopoverState<unknown>) => state.instantType),
	openMethod: createSelector((state: PopoverState<unknown>) => state.openMethod),
	openChangeReason: createSelector((state: PopoverState<unknown>) => state.openChangeReason),
	modal: createSelector((state: PopoverState<unknown>) => state.modal),
	focusManagerModal: createSelector((state: PopoverState<unknown>) => state.focusManagerModal),
	stickIfOpen: createSelector((state: PopoverState<unknown>) => state.stickIfOpen),
	titleElementId: createSelector((state: PopoverState<unknown>) => state.titleElementId),
	descriptionElementId: createSelector(
		(state: PopoverState<unknown>) => state.descriptionElementId,
	),
	openOnHover: createSelector((state: PopoverState<unknown>) => state.openOnHover),
	closeDelay: createSelector((state: PopoverState<unknown>) => state.closeDelay),
	hasViewport: createSelector((state: PopoverState<unknown>) => state.hasViewport),
};

export class PopoverStore<Payload> extends ReactStore<
	Readonly<PopoverState<Payload>>,
	PopoverContext,
	typeof popoverSelectors
> {
	constructor(
		initialState?: Partial<PopoverState<Payload>>,
		floatingId?: string | undefined,
		nested = false,
	) {
		const initial = { ...createInitialPopoverState<Payload>(), ...initialState };
		const triggerElements = new PopupTriggerMap();
		if (initial.open && initialState?.mounted === undefined) {
			initial.mounted = true;
		}
		initial.floatingRootContext = createPopupFloatingRootContext(
			triggerElements,
			floatingId,
			nested,
		);

		super(
			initial,
			{
				popupRef: { current: null },
				backdropRef: { current: null },
				internalBackdropRef: { current: null },
				onOpenChange: undefined,
				onOpenChangeComplete: undefined,
				triggerFocusTargetRef: { current: null },
				beforeContentFocusGuardRef: { current: null },
				stickIfOpenTimeout: new Timeout(),
				triggerElements,
			} as PopoverContext,
			popoverSelectors,
		);
	}

	setOpen = (nextOpen: boolean, eventDetails: any) => {
		const isHover = eventDetails.reason === REASONS.triggerHover;
		const isKeyboardClick =
			eventDetails.reason === REASONS.triggerPress &&
			(eventDetails.event as MouseEvent).detail === 0;
		const isDismissClose =
			!nextOpen && (eventDetails.reason === REASONS.escapeKey || eventDetails.reason == null);

		const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(eventDetails);

		const activeTriggerId = this.select('activeTriggerId');
		if (
			!nextOpen &&
			eventDetails.reason === REASONS.closePress &&
			eventDetails.trigger == null &&
			activeTriggerId != null
		) {
			eventDetails.trigger =
				this.context.triggerElements.getById(activeTriggerId) ??
				this.select('activeTriggerElement') ??
				undefined;
		}

		this.context.onOpenChange?.(nextOpen, eventDetails);
		if (eventDetails.isCanceled) {
			return;
		}

		(this.state.floatingRootContext as any).dispatchOpenChange(nextOpen, eventDetails);

		const changeState = () => {
			const updatedState: Partial<PopoverState<Payload>> = {
				open: nextOpen,
				openChangeReason: eventDetails.reason,
			};
			setPopupOpenState(
				updatedState as any,
				nextOpen,
				eventDetails.trigger,
				shouldPreventUnmountOnClose(),
			);
			this.update(updatedState);
		};

		if (isHover) {
			this.set('stickIfOpen', true);
			this.context.stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
				this.set('stickIfOpen', false);
			});
			flushSync(changeState);
		} else {
			changeState();
		}

		if (isKeyboardClick || isDismissClose) {
			this.set('instantType', isKeyboardClick ? 'click' : 'dismiss');
		} else if (eventDetails.reason === REASONS.focusOut) {
			this.set('instantType', 'focus');
		} else {
			this.set('instantType', undefined);
		}
	};

	disposeEffect = () => {
		return this.context.stickIfOpenTimeout.disposeEffect();
	};

	static useStore<Payload>(
		externalStore: PopoverStore<Payload> | undefined,
		initialState: Partial<PopoverState<Payload>>,
		slot: symbol | undefined,
	): PopoverStore<Payload> {
		const { store, internalStore } = usePopupStore(
			externalStore as any,
			(floatingId, nested) => new PopoverStore<Payload>(initialState, floatingId, nested) as any,
			false,
			subSlot(slot, 'pop'),
		);
		useEffect(
			() => (internalStore as any)?.disposeEffect(),
			[internalStore],
			subSlot(slot, 'dispose'),
		);
		return store as unknown as PopoverStore<Payload>;
	}
}

// --- Handle ------------------------------------------------------------------

export class PopoverHandle<Payload> {
	readonly store: PopoverStore<Payload>;

	constructor() {
		this.store = new PopoverStore<Payload>();
	}

	open(triggerId: string) {
		const triggerElement = triggerId
			? (this.store.context.triggerElements.getById(triggerId) ?? undefined)
			: undefined;
		if (triggerId && !triggerElement) {
			throw new Error(`Base UI: PopoverHandle.open: No trigger found with id "${triggerId}".`);
		}
		this.store.setOpen(
			true,
			createChangeEventDetails(
				REASONS.imperativeAction,
				undefined,
				triggerElement as HTMLElement | undefined,
			),
		);
	}

	close() {
		this.store.setOpen(
			false,
			createChangeEventDetails(REASONS.imperativeAction, undefined, undefined),
		);
	}

	get isOpen() {
		return this.store.select('open');
	}
}

export function createPopoverHandle<Payload>(): PopoverHandle<Payload> {
	return new PopoverHandle<Payload>();
}

// --- Contexts ----------------------------------------------------------------

export interface PopoverRootContextValue<Payload = unknown> {
	store: PopoverStore<Payload>;
}

const PopoverRootContext = createContext<PopoverRootContextValue | undefined>(undefined);

export function usePopoverRootContext(optional?: boolean): PopoverRootContextValue | undefined {
	const context = useContext(PopoverRootContext);
	if (context === undefined && !optional) {
		throw new Error(
			'Base UI: PopoverRootContext is missing. Popover parts must be placed within <Popover.Root>.',
		);
	}
	return context;
}

const PopoverPortalContext = createContext<boolean | undefined>(undefined);

export function usePopoverPortalContext(): boolean {
	const value = useContext(PopoverPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <Popover.Portal> is missing.');
	}
	return value;
}

export interface PopoverPositionerContextValue {
	side: Side;
	align: Align;
	arrowRef: { current: Element | null };
	arrowUncentered: boolean;
	arrowStyles: Record<string, any>;
	context: any;
}

const PopoverPositionerContext = createContext<PopoverPositionerContextValue | undefined>(
	undefined,
);

export function usePopoverPositionerContext(): PopoverPositionerContextValue {
	const context = useContext(PopoverPositionerContext);
	if (!context) {
		throw new Error(
			'Base UI: PopoverPositionerContext is missing. PopoverPositioner parts must be placed within <Popover.Positioner>.',
		);
	}
	return context;
}

// --- Interactions (+ passthrough for the stable-descriptor Provider children) ---

function PopoverInteractions(props: any): any {
	const slot = S('PopoverInteractions');
	const { store, modal } = props;

	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));

	const dismiss = useDismiss(
		floatingRootContext,
		{
			outsidePressEvent: {
				mouse: modal === 'trap-focus' ? 'sloppy' : 'intentional',
				touch: 'sloppy',
			},
		},
		subSlot(slot, 'dismiss'),
	);

	const activeTriggerProps = dismiss.reference ?? EMPTY_OBJECT;
	const inactiveTriggerProps = dismiss.trigger ?? EMPTY_OBJECT;
	const popupProps = useMemo(
		() => mergeProps(FOCUSABLE_POPUP_PROPS, dismiss.floating),
		[dismiss.floating],
		subSlot(slot, 'pp'),
	);

	usePopupInteractionProps(
		store,
		{ activeTriggerProps, inactiveTriggerProps, popupProps } as any,
		subSlot(slot, 'pip'),
	);

	return props.children ?? null;
}

function PopoverChildren(props: any): any {
	return props.children ?? null;
}

// --- Root --------------------------------------------------------------------

function PopoverRootComponent<Payload>(props: any): any {
	const slot = S('PopoverRoot');
	const {
		children,
		open: openProp,
		defaultOpen = false,
		onOpenChange,
		onOpenChangeComplete,
		modal = false,
		handle,
		actionsRef,
		triggerId: triggerIdProp,
		defaultTriggerId: defaultTriggerIdProp = null,
	} = props;

	const store = PopoverStore.useStore<Payload>(
		handle?.store,
		{
			modal,
			open: defaultOpen,
			openProp,
			activeTriggerId: defaultTriggerIdProp,
			triggerIdProp,
		} as Partial<PopoverState<Payload>>,
		subSlot(slot, 'store'),
	);

	useInitialOpenSync(
		store as any,
		openProp,
		defaultOpen,
		defaultTriggerIdProp,
		subSlot(slot, 'ios'),
	);

	store.useControlledProp('openProp', openProp, subSlot(slot, 'cp-open'));
	store.useControlledProp('triggerIdProp', triggerIdProp, subSlot(slot, 'cp-tid'));

	const open = store.useState('open', subSlot(slot, 'open'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const payload = store.useState('payload', subSlot(slot, 'payload')) as Payload | undefined;
	const nested = useFloatingParentNodeId() != null;

	store.useContextCallback('onOpenChange', onOpenChange, subSlot(slot, 'cc-change'));
	store.useContextCallback(
		'onOpenChangeComplete',
		onOpenChangeComplete,
		subSlot(slot, 'cc-complete'),
	);

	usePopupRootSync(store as any, open, subSlot(slot, 'rootSync'));
	useImplicitActiveTrigger(store as any, {}, subSlot(slot, 'iat'));
	const { forceUnmount } = useOpenStateTransitions(
		open,
		store as any,
		() => {
			store.update({ stickIfOpen: true, openChangeReason: null });
		},
		subSlot(slot, 'ost'),
	);

	store.useSyncedValues({ modal, nested } as any, subSlot(slot, 'sv'));

	useEffect(
		() => {
			if (!open) {
				store.context.stickIfOpenTimeout.clear();
			}
		},
		[store, open],
		subSlot(slot, 'e:stick'),
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

	const shouldRenderInteractions = open || mounted;

	const contextValue = useMemo(() => ({ store }), [store], subSlot(slot, 'ctx'));

	const resolvedChildren =
		typeof children === 'function' && !isChildrenBlock(children) ? children({ payload }) : children;

	// Stable descriptor shape (see the Dialog note / octane Provider children shape-flip bug).
	const content = createElement(shouldRenderInteractions ? PopoverInteractions : PopoverChildren, {
		store,
		modal,
		children: resolvedChildren,
	});

	return createElement(PopoverRootContext.Provider, {
		value: contextValue as PopoverRootContextValue,
		children: content,
	});
}

function PopoverRoot<Payload = unknown>(props: any): any {
	const slot = S('PopoverRootWrapper');
	// Top-level popovers establish a FloatingTree; nested ones reuse the parent's.
	if (usePopoverRootContext(true)) {
		return createElement(PopoverRootComponent, props);
	}
	return createElement(FloatingTree, {
		children: createElement(PopoverRootComponent, props),
	});
}

// --- Trigger -----------------------------------------------------------------

function PopoverTrigger(componentProps: any): any {
	const slot = S('PopoverTrigger');
	const {
		render,
		className,
		style,
		disabled = false,
		nativeButton = true,
		handle,
		payload,
		openOnHover = false,
		delay = OPEN_DELAY,
		closeDelay = 0,
		id: idProp,
		ref,
		...elementProps
	} = componentProps;

	const rootContext = usePopoverRootContext(true);
	const store = (handle?.store ?? rootContext?.store) as PopoverStore<any> | undefined;
	if (!store) {
		throw new Error(
			'Base UI: <Popover.Trigger> must be either used within a <Popover.Root> component or provided with a handle.',
		);
	}

	const thisTriggerId = useBaseUiId(idProp, subSlot(slot, 'id'));
	const isTriggerActive = store.useState('isTriggerActive', subSlot(slot, 'ita'), thisTriggerId);
	const floatingContext = store.useState('floatingRootContext', subSlot(slot, 'fc'));
	const isOpenedByThisTrigger = store.useState(
		'isOpenedByTrigger',
		subSlot(slot, 'obt'),
		thisTriggerId,
	);
	const popupId = store.useState('triggerPopupId', subSlot(slot, 'tpid'), thisTriggerId);

	const triggerElementRef = useRef<HTMLElement | null>(null, subSlot(slot, 'ter'));

	const { registerTrigger, isMountedByThisTrigger } = useTriggerDataForwarding(
		thisTriggerId,
		triggerElementRef,
		store as any,
		{ payload, disabled, openOnHover, closeDelay } as any,
		subSlot(slot, 'tdf'),
	);

	const openReason = store.useState('openChangeReason', subSlot(slot, 'ocr'));
	const stickIfOpen = store.useState('stickIfOpen', subSlot(slot, 'sio'));
	const openMethod = store.useState('openMethod', subSlot(slot, 'om'));
	const focusManagerModal = store.useState('focusManagerModal', subSlot(slot, 'fmm'));

	const hoverProps = useHoverReferenceInteraction(
		floatingContext,
		{
			enabled:
				!disabled &&
				floatingContext != null &&
				openOnHover &&
				(openMethod !== 'touch' || openReason !== REASONS.triggerPress),
			mouseOnly: true,
			move: false,
			handleClose: safePolygon(),
			restMs: delay,
			delay: { close: closeDelay },
			triggerElementRef,
			isActiveTrigger: isTriggerActive,
			isClosing: () => store.select('transitionStatus') === 'ending',
		},
		subSlot(slot, 'hover'),
	);

	const click = useClick(
		floatingContext,
		{ enabled: floatingContext != null, stickIfOpen },
		subSlot(slot, 'click'),
	);
	const interactionTypeProps = useOpenMethodTriggerProps(
		() => store.select('open'),
		(interactionType) => {
			store.set('openMethod', interactionType);
		},
		subSlot(slot, 'omt'),
	);

	const rootTriggerProps = store.useState(
		'triggerProps',
		subSlot(slot, 'tp'),
		isMountedByThisTrigger,
	);

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton },
		subSlot(slot, 'btn'),
	);

	const stateAttributesMapping: StateAttributesMapping<{ open: boolean }> = {
		open(value: boolean) {
			if (value && openReason === REASONS.triggerPress) {
				return pressableTriggerOpenStateMapping.open!(value);
			}
			return triggerOpenStateMapping.open!(value);
		},
	};

	const { preFocusGuardRef, handlePreFocusGuardFocus, handleFocusTargetFocus } =
		useTriggerFocusGuards(store as any, triggerElementRef, subSlot(slot, 'tfg'));

	const state = { disabled, open: isOpenedByThisTrigger };

	const element = useRenderElement(
		'button',
		{ render, className, style },
		{
			state,
			ref: [buttonRef, ref, registerTrigger, triggerElementRef],
			props: [
				click.reference,
				hoverProps,
				rootTriggerProps,
				interactionTypeProps,
				{
					[CLICK_TRIGGER_IDENTIFIER]: '',
					id: thisTriggerId,
					'aria-haspopup': 'dialog',
					'aria-expanded': isOpenedByThisTrigger,
					'aria-controls': popupId,
				},
				elementProps,
				getButtonProps,
			],
			stateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	if (isMountedByThisTrigger && !focusManagerModal) {
		return [
			createElement(FocusGuard, { ref: preFocusGuardRef, onFocus: handlePreFocusGuardFocus }),
			element,
			createElement(FocusGuard, {
				ref: store.context.triggerFocusTargetRef,
				onFocus: handleFocusTargetFocus,
			}),
		];
	}

	return element;
}

// --- Portal ------------------------------------------------------------------

function PopoverPortal(props: any): any {
	const slot = S('PopoverPortal');
	const { keepMounted = false, ref, ...portalProps } = props;

	const { store } = usePopoverRootContext() as PopoverRootContextValue;
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));

	const shouldRender = mounted || keepMounted;
	if (!shouldRender) {
		return null;
	}

	return createElement(PopoverPortalContext.Provider, {
		value: keepMounted,
		children: createElement(FloatingPortal, { ref, ...portalProps }),
	});
}

// --- Positioner --------------------------------------------------------------

function PopoverPositioner(componentProps: any): any {
	const slot = S('PopoverPositioner');
	const {
		render,
		className,
		style,
		anchor,
		positionMethod = 'absolute',
		side = 'bottom',
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

	const { store } = usePopoverRootContext() as PopoverRootContextValue;
	const keepMounted = usePopoverPortalContext();
	const nodeId = useFloatingNodeId(undefined, subSlot(slot, 'nodeId'));

	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const open = store.useState('open', subSlot(slot, 'open'));
	const openReason = store.useState('openChangeReason', subSlot(slot, 'reason'));
	const triggerElement = store.useState('activeTriggerElement', subSlot(slot, 'trigger'));
	const modal = store.useState('modal', subSlot(slot, 'modal'));
	const openMethod = store.useState('openMethod', subSlot(slot, 'method'));
	const positionerElement = store.useState('positionerElement', subSlot(slot, 'posEl'));
	const instantType = store.useState('instantType', subSlot(slot, 'instant'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const hasViewport = store.useState('hasViewport', subSlot(slot, 'viewport'));

	const prevTriggerElementRef = useRef<Element | null>(null, subSlot(slot, 'prevTrigger'));

	const runOnceAnimationsFinish = useAnimationsFinished(
		positionerElement,
		false,
		false,
		subSlot(slot, 'anim'),
	);

	const positioning = useAnchorPositioning(
		{
			anchor,
			floatingRootContext,
			positionMethod,
			mounted,
			side,
			sideOffset,
			align,
			alignOffset,
			arrowPadding,
			collisionBoundary,
			collisionPadding,
			sticky,
			disableAnchorTracking,
			keepMounted,
			nodeId,
			collisionAvoidance,
			adaptiveOrigin: hasViewport ? adaptiveOrigin : undefined,
		},
		subSlot(slot, 'positioning'),
	);

	const domReference = floatingRootContext.useState('domReferenceElement', subSlot(slot, 'domref'));

	// When the current trigger element changes, enable transitions on the positioner temporarily.
	useLayoutEffect(
		() => {
			const currentTriggerElement = domReference;
			const prevTriggerElement = prevTriggerElementRef.current;

			if (currentTriggerElement) {
				prevTriggerElementRef.current = currentTriggerElement;
			}

			if (
				prevTriggerElement &&
				currentTriggerElement &&
				currentTriggerElement !== prevTriggerElement
			) {
				store.set('instantType', undefined);
				const ac = new AbortController();
				runOnceAnimationsFinish(() => {
					store.set('instantType', 'trigger-change');
				}, ac.signal);

				return () => {
					ac.abort();
				};
			}

			return undefined;
		},
		[domReference, runOnceAnimationsFinish, store],
		subSlot(slot, 'e:trigger'),
	);

	useAnchoredPopupScrollLock(
		open && modal === true && openReason !== REASONS.triggerHover,
		openMethod === 'touch',
		positionerElement,
		triggerElement,
	);

	const setPositionerElement = useCallback(
		(element: HTMLElement | null) => {
			store.set('positionerElement', element);
		},
		[store],
		subSlot(slot, 'setPosEl'),
	);

	const state: PopoverPositionerState = {
		open,
		side: positioning.side,
		align: positioning.align,
		anchorHidden: positioning.anchorHidden,
		instant: instantType,
	};

	const element = usePositioner(
		componentProps,
		state,
		{
			styles: positioning.positionerStyles,
			transitionStatus,
			props: elementProps,
			refs: [ref, setPositionerElement],
			hidden: !mounted,
			inert: !open,
		},
		subSlot(slot, 'positioner'),
	);

	return createElement(PopoverPositionerContext.Provider, {
		value: positioning as unknown as PopoverPositionerContextValue,
		children: [
			mounted && modal === true && openReason !== REASONS.triggerHover
				? createElement(InternalBackdrop, {
						ref: store.context.internalBackdropRef,
						inert: inertValue(!open),
						cutout: triggerElement,
					})
				: null,
			createElement(FloatingNode, { id: nodeId, children: element }),
		],
	});
}

interface PopoverPositionerState {
	open: boolean;
	side: Side;
	align: Align;
	anchorHidden: boolean;
	instant: string | undefined;
}

// --- Popup -------------------------------------------------------------------

const popoverPopupStateAttributesMapping = {
	...popupStateMapping,
	...transitionStatusMapping,
};

function PopoverPopup(componentProps: any): any {
	const slot = S('PopoverPopup');
	const { render, className, style, initialFocus, finalFocus, ref, ...elementProps } =
		componentProps;

	const { store } = usePopoverRootContext() as PopoverRootContextValue;

	const positioner = usePopoverPositionerContext();
	// No Toolbar context in this phase; composite key-stop is toolbar-only.
	const insideToolbar = false;
	const { context: closePartContext, hasClosePart } = useClosePartCount();

	const open = store.useState('open', subSlot(slot, 'open'));
	const openMethod = store.useState('openMethod', subSlot(slot, 'method'));
	const instantType = store.useState('instantType', subSlot(slot, 'instant'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const popupProps = store.useState('popupProps', subSlot(slot, 'popupProps'));
	const titleId = store.useState('titleElementId', subSlot(slot, 'titleId'));
	const descriptionId = store.useState('descriptionElementId', subSlot(slot, 'descId'));
	const modal = store.useState('modal', subSlot(slot, 'modal'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const openReason = store.useState('openChangeReason', subSlot(slot, 'reason'));
	const activeTriggerElement = store.useState('activeTriggerElement', subSlot(slot, 'trigger'));
	const floatingContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const floatingId = floatingContext.useState('floatingId', subSlot(slot, 'fid'));
	const disabled = store.useState('disabled', subSlot(slot, 'disabled'));
	const openOnHover = store.useState('openOnHover', subSlot(slot, 'hover'));
	const closeDelay = store.useState('closeDelay', subSlot(slot, 'closeDelay'));

	const popupId = elementProps.id ?? floatingId;

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
		{ enabled: openOnHover && !disabled, closeDelay },
		subSlot(slot, 'hoverInteraction'),
	);

	const resolvedInitialFocus =
		initialFocus === undefined ? createDefaultInitialFocus(store.context.popupRef) : initialFocus;

	const focusManagerModal = modal !== false && hasClosePart;
	store.useSyncedValue('focusManagerModal', focusManagerModal, subSlot(slot, 'fmm'));

	const setPopupElement = useCallback(
		(element: HTMLElement | null) => {
			store.set('popupElement', element);
		},
		[store],
		subSlot(slot, 'setPopupEl'),
	);

	const state: PopoverPopupState = {
		open,
		side: positioner.side,
		align: positioner.align,
		instant: instantType,
		transitionStatus,
	};

	const element = useRenderElement(
		'div',
		componentProps,
		{
			state,
			ref: [ref, store.context.popupRef, setPopupElement],
			props: [
				popupProps,
				{
					id: popupId,
					role: 'dialog',
					...FOCUSABLE_POPUP_PROPS,
					'aria-labelledby': titleId,
					'aria-describedby': descriptionId,
					onKeyDown(event: any) {
						if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
							event.stopPropagation();
						}
					},
				},
				getDisabledMountTransitionStyles(transitionStatus),
				elementProps,
			],
			stateAttributesMapping: popoverPopupStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	return createElement(FloatingFocusManager, {
		context: floatingContext,
		openInteractionType: openMethod,
		modal: focusManagerModal,
		disabled: !mounted || openReason === REASONS.triggerHover,
		initialFocus: resolvedInitialFocus,
		returnFocus: finalFocus,
		restoreFocus: 'popup',
		previousFocusableElement: isHTMLElement(activeTriggerElement)
			? activeTriggerElement
			: undefined,
		nextFocusableElement: store.context.triggerFocusTargetRef,
		beforeContentFocusGuardRef: store.context.beforeContentFocusGuardRef,
		children: createElement(ClosePartProvider, { value: closePartContext, children: element }),
	});
}

interface PopoverPopupState {
	open: boolean;
	side: Side;
	align: Align;
	transitionStatus: any;
	instant: 'dismiss' | 'click' | 'focus' | 'trigger-change' | undefined;
}

// --- Arrow -------------------------------------------------------------------

function PopoverArrow(componentProps: any): any {
	const slot = S('PopoverArrow');
	const { render, className, style, ref, ...elementProps } = componentProps;

	const { store } = usePopoverRootContext() as PopoverRootContextValue;
	const open = store.useState('open', subSlot(slot, 'open'));
	const { arrowRef, side, align, arrowUncentered, arrowStyles } = usePopoverPositionerContext();

	const state: PopoverArrowState = {
		open,
		side,
		align,
		uncentered: arrowUncentered,
	};

	return useRenderElement(
		'div',
		componentProps,
		{
			state,
			ref: [ref, arrowRef],
			props: [{ style: arrowStyles, 'aria-hidden': true }, elementProps],
			stateAttributesMapping: popupStateMapping,
		},
		subSlot(slot, 're'),
	);
}

interface PopoverArrowState {
	open: boolean;
	side: Side;
	align: Align;
	uncentered: boolean;
}

// --- Backdrop ----------------------------------------------------------------

const popoverBackdropStateAttributesMapping = {
	...popupStateMapping,
	...transitionStatusMapping,
};

function PopoverBackdrop(props: any): any {
	const slot = S('PopoverBackdrop');
	const { render, className, style, ref, ...elementProps } = props;

	const { store } = usePopoverRootContext() as PopoverRootContextValue;

	const open = store.useState('open', subSlot(slot, 'open'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const openReason = store.useState('openChangeReason', subSlot(slot, 'reason'));

	const state: PopoverBackdropState = {
		open,
		transitionStatus,
	};

	return useRenderElement(
		'div',
		props,
		{
			state,
			ref: [store.context.backdropRef, ref],
			props: [
				{
					role: 'presentation',
					hidden: !mounted,
					style: {
						pointerEvents: openReason === REASONS.triggerHover ? 'none' : undefined,
						userSelect: 'none',
						WebkitUserSelect: 'none',
					},
				},
				elementProps,
			],
			stateAttributesMapping: popoverBackdropStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

interface PopoverBackdropState {
	open: boolean;
	transitionStatus: any;
}

// --- Title -------------------------------------------------------------------

function PopoverTitle(componentProps: any): any {
	const slot = S('PopoverTitle');
	const { render, className, style, ref, ...elementProps } = componentProps;

	const { store } = usePopoverRootContext() as PopoverRootContextValue;

	const id = useBaseUiId(elementProps.id, subSlot(slot, 'id'));

	store.useSyncedValueWithCleanup('titleElementId', id, subSlot(slot, 'sync'));

	return useRenderElement(
		'h2',
		componentProps,
		{
			ref,
			props: [{ id }, elementProps],
		},
		subSlot(slot, 're'),
	);
}

// --- Description -------------------------------------------------------------

function PopoverDescription(componentProps: any): any {
	const slot = S('PopoverDescription');
	const { render, className, style, ref, ...elementProps } = componentProps;

	const { store } = usePopoverRootContext() as PopoverRootContextValue;

	const id = useBaseUiId(elementProps.id, subSlot(slot, 'id'));

	store.useSyncedValueWithCleanup('descriptionElementId', id, subSlot(slot, 'sync'));

	return useRenderElement(
		'p',
		componentProps,
		{
			ref,
			props: [{ id }, elementProps],
		},
		subSlot(slot, 're'),
	);
}

// --- Close -------------------------------------------------------------------

function PopoverClose(componentProps: any): any {
	const slot = S('PopoverClose');
	const {
		render,
		className,
		style,
		disabled = false,
		nativeButton = true,
		ref,
		...elementProps
	} = componentProps;

	const { buttonRef, getButtonProps } = useButton(
		{ disabled, focusableWhenDisabled: false, native: nativeButton },
		subSlot(slot, 'btn'),
	);

	const { store } = usePopoverRootContext() as PopoverRootContextValue;
	useClosePartRegistration();

	return useRenderElement(
		'button',
		componentProps,
		{
			ref: [ref, buttonRef],
			props: [
				{
					onClick(event: any) {
						store.setOpen(false, createChangeEventDetails(REASONS.closePress, event));
					},
				},
				elementProps,
				getButtonProps,
			],
		},
		subSlot(slot, 're'),
	);
}

// --- Namespace ---------------------------------------------------------------

export const Popover = {
	Root: PopoverRoot,
	Trigger: PopoverTrigger,
	Portal: PopoverPortal,
	Positioner: PopoverPositioner,
	Popup: PopoverPopup,
	Arrow: PopoverArrow,
	Backdrop: PopoverBackdrop,
	Title: PopoverTitle,
	Description: PopoverDescription,
	Close: PopoverClose,
	createHandle: createPopoverHandle,
};
