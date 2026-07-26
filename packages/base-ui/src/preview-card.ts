// Ported from .base-ui/packages/react/src/preview-card/ (v1.6.0): store (PreviewCardStore/
// PreviewCardHandle), root (+ PreviewCardInteractions), trigger, portal, positioner, popup,
// backdrop, arrow, viewport. Reuses the Store + floating stack from Dialog/Popover, the Phase-3b
// hover/focus layer, and the Phase-3c viewport.
//
// The distinctive piece is the inline-rect anchoring: the trigger is a link that may wrap across
// several lines, so the card anchors to the specific line the cursor was on
// (`utils/popups/inlineRect`).
//
// octane adaptations: forwardRef → ref-as-prop; native events; every Store hook-method + hook
// threads an explicit slot; `React.createContext` → octane `createContext`.
import {
	createContext,
	createElement,
	Fragment,
	useContext,
	useMemo,
	useRef,
	useLayoutEffect,
	useCallback,
	useImperativeHandle,
	isChildrenBlock,
} from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import { mergeProps } from './utils/mergeProps';
import { useBaseUiId } from './utils/useBaseUiId';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { EMPTY_OBJECT } from './utils/empty';
import { ReactStore } from './utils/store/ReactStore';
import { createSelector } from './utils/store/createSelector';
import { useStableCallback } from './utils/useStableCallback';
import { useDismiss } from './utils/floating/useDismiss';
import { useFocus } from './utils/floating/useFocus';
import {
	safePolygon,
	useHoverReferenceInteraction,
} from './utils/floating/useHoverReferenceInteraction';
import { useHoverFloatingInteraction } from './utils/floating/useHoverFloatingInteraction';
import { FloatingTree, FloatingNode, useFloatingNodeId } from './utils/floating/FloatingTree';
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
import { popupStateMapping, triggerOpenStateMapping } from './utils/popupStateMapping';
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
	createInlineMiddleware,
	getInlineRectTriggerProps,
	updateInlineRectCoords,
	type InlineRectCoords,
	type PopupStoreState,
	type PopupStoreContext,
} from './utils/popups';
import { PopupTriggerMap } from './utils/popups/popupTriggerMap';

export const OPEN_DELAY = 600;
export const CLOSE_DELAY = 300;

export const PreviewCardViewportCssVars = {
	popupWidth: '--popup-width',
	popupHeight: '--popup-height',
} as const;

// --- Store -------------------------------------------------------------------

export type PreviewCardState<Payload> = PopupStoreState<Payload> & {
	instantType: 'dismiss' | 'focus' | undefined;
	hasViewport: boolean;
};

type PreviewCardContext = PopupStoreContext<any> & {
	readonly popupRef: { current: HTMLElement | null };
	readonly closeDelayRef: { current: number };
	readonly inlineRectCoordsRef: { current: InlineRectCoords | undefined };
};

const previewCardSelectors = {
	...popupStoreSelectors,
	instantType: createSelector((state: PreviewCardState<unknown>) => state.instantType),
	hasViewport: createSelector((state: PreviewCardState<unknown>) => state.hasViewport),
};

function createInitialPreviewCardState<Payload>(): PreviewCardState<Payload> {
	return {
		...createInitialPopupStoreState<Payload>(),
		instantType: undefined,
		hasViewport: false,
	};
}

export class PreviewCardStore<Payload> extends ReactStore<
	Readonly<PreviewCardState<Payload>>,
	PreviewCardContext,
	typeof previewCardSelectors
> {
	constructor(
		initialState?: Partial<PreviewCardState<Payload>>,
		floatingId?: string | undefined,
		nested = false,
	) {
		const triggerElements = new PopupTriggerMap();
		const state = { ...createInitialPreviewCardState<Payload>(), ...initialState };
		state.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);

		super(
			state,
			{
				popupRef: { current: null },
				onOpenChange: undefined,
				onOpenChangeComplete: undefined,
				triggerElements,
				closeDelayRef: { current: CLOSE_DELAY },
				inlineRectCoordsRef: { current: undefined },
			} as PreviewCardContext,
			previewCardSelectors,
		);
	}

	setOpen = (nextOpen: boolean, eventDetails: any) => {
		const { inlineRectCoordsRef } = this.context;

		applyPopupOpenChange(this as any, nextOpen, eventDetails, {
			onBeforeDispatch() {
				// Capture the hovered inline-rect coordinates so the card anchors to the exact point
				// on the link that was hovered.
				const event = eventDetails.event;
				if (
					nextOpen &&
					eventDetails.reason === REASONS.triggerHover &&
					eventDetails.trigger &&
					event &&
					'clientX' in event &&
					'clientY' in event &&
					inlineRectCoordsRef.current?.element !== eventDetails.trigger
				) {
					updateInlineRectCoords(
						inlineRectCoordsRef,
						eventDetails.trigger,
						event.clientX,
						event.clientY,
					);
				}
			},
		} as any);
	};

	static useStore<Payload>(
		externalStore: PreviewCardStore<Payload> | undefined,
		initialState: Partial<PreviewCardState<Payload>>,
		slot: symbol | undefined,
	): PreviewCardStore<Payload> {
		return usePopupStore(
			externalStore as any,
			(floatingId, nested) =>
				new PreviewCardStore<Payload>(initialState, floatingId, nested) as any,
			true,
			slot,
		).store as unknown as PreviewCardStore<Payload>;
	}
}

// --- Handle ------------------------------------------------------------------

export class PreviewCardHandle<Payload> {
	readonly store: PreviewCardStore<Payload>;

	constructor(store?: PreviewCardStore<Payload>) {
		this.store = store ?? new PreviewCardStore<Payload>();
	}

	open(triggerId: string): void {
		const triggerElement = triggerId
			? (this.store.context.triggerElements.getById(triggerId) as HTMLElement | undefined)
			: undefined;

		if (triggerId && !triggerElement) {
			throw new Error(`Base UI: PreviewCardHandle.open: No trigger found with id "${triggerId}".`);
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

export function createPreviewCardHandle<Payload = unknown>(): PreviewCardHandle<Payload> {
	return new PreviewCardHandle<Payload>();
}

// --- Contexts ----------------------------------------------------------------

const PreviewCardRootContext = createContext<PreviewCardStore<any> | undefined>(undefined);

export function usePreviewCardRootContext(optional?: boolean): PreviewCardStore<any> | undefined {
	const context = useContext(PreviewCardRootContext);
	if (context === undefined && !optional) {
		throw new Error(
			'Base UI: PreviewCardRootContext is missing. PreviewCard parts must be placed within <PreviewCard.Root>.',
		);
	}
	return context;
}

const PreviewCardPortalContext = createContext<boolean | undefined>(undefined);

function usePreviewCardPortalContext(): boolean {
	const value = useContext(PreviewCardPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <PreviewCard.Portal> is missing.');
	}
	return value;
}

export interface PreviewCardPositionerContextValue {
	side: Side;
	align: Align;
	arrowRef: { current: Element | null };
	arrowUncentered: boolean;
	arrowStyles: Record<string, any>;
}

const PreviewCardPositionerContext = createContext<PreviewCardPositionerContextValue | undefined>(
	undefined,
);

export function usePreviewCardPositionerContext(): PreviewCardPositionerContextValue {
	const context = useContext(PreviewCardPositionerContext);
	if (!context) {
		throw new Error(
			'Base UI: PreviewCardPositionerContext is missing. PreviewCardPositioner parts must be placed within <PreviewCard.Positioner>.',
		);
	}
	return context;
}

// --- Interactions ------------------------------------------------------------

function PreviewCardInteractions(props: any): any {
	const slot = S('PreviewCardInteractions');
	const { store } = props;

	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));

	const dismiss = useDismiss(floatingRootContext, {}, subSlot(slot, 'dismiss'));
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

	return null;
}

// --- Root --------------------------------------------------------------------

function PreviewCardRootComponent<Payload>(props: any): any {
	const slot = S('PreviewCardRoot');
	const {
		open: openProp,
		defaultOpen = false,
		onOpenChange,
		onOpenChangeComplete,
		actionsRef,
		handle,
		triggerId: triggerIdProp,
		defaultTriggerId: defaultTriggerIdProp = null,
		children,
	} = props;

	const store = PreviewCardStore.useStore<Payload>(
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

	const open = store.useState('open', subSlot(slot, 'open'));
	const activeTriggerId = store.useState('activeTriggerId', subSlot(slot, 'atid'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const payload = store.useState('payload', subSlot(slot, 'payload'));

	useImplicitActiveTrigger(store, { closeOnActiveTriggerUnmount: true }, subSlot(slot, 'implicit'));
	const { forceUnmount } = useOpenStateTransitions(
		open,
		store as any,
		() => {
			store.context.inlineRectCoordsRef.current = undefined;
		},
		subSlot(slot, 'transitions'),
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

	const shouldRenderInteractions = open || mounted;

	const resolvedChildren =
		typeof children === 'function' && !isChildrenBlock(children) ? children({ payload }) : children;

	// `PreviewCardInteractions` is a headless SIBLING of the children, exactly as Base UI renders it.
	const content = [
		shouldRenderInteractions
			? createElement(PreviewCardInteractions, { key: 'interactions', store })
			: null,
		createElement(Fragment, { key: 'children', children: resolvedChildren }),
	];

	return createElement(PreviewCardRootContext.Provider, { value: store, children: content });
}

function PreviewCardRoot<Payload = unknown>(props: any): any {
	// Top-level preview cards establish a FloatingTree; nested ones reuse the parent's.
	if (usePreviewCardRootContext(true)) {
		return createElement(PreviewCardRootComponent, props);
	}
	return createElement(FloatingTree, {
		children: createElement(PreviewCardRootComponent, props),
	});
}

// --- Trigger -----------------------------------------------------------------

function PreviewCardTrigger(componentProps: any): any {
	const slot = S('PreviewCardTrigger');
	const {
		render,
		className,
		delay,
		closeDelay,
		id: idProp,
		payload,
		handle,
		style,
		ref,
		...elementProps
	} = componentProps;

	const rootContext = usePreviewCardRootContext(true);
	const store = (handle?.store ?? rootContext) as PreviewCardStore<any> | undefined;
	if (!store) {
		throw new Error(
			'Base UI: <PreviewCard.Trigger> must be either used within a <PreviewCard.Root> component or provided with a handle.',
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
	const inlineRectCoordsRef = store.context.inlineRectCoordsRef;

	const triggerElementRef = useRef<Element | null>(null, subSlot(slot, 'trigEl'));

	const delayWithDefault = delay ?? OPEN_DELAY;
	const closeDelayWithDefault = closeDelay ?? CLOSE_DELAY;

	const { registerTrigger, isMountedByThisTrigger } = useTriggerDataForwarding(
		thisTriggerId,
		triggerElementRef,
		store,
		{ payload },
		subSlot(slot, 'tdf'),
	);

	useLayoutEffect(
		() => {
			if (isMountedByThisTrigger) {
				store.context.closeDelayRef.current = closeDelayWithDefault;
			}
		},
		[store, isMountedByThisTrigger, closeDelayWithDefault],
		subSlot(slot, 'l:closeDelay'),
	);

	const hoverProps = useHoverReferenceInteraction(
		floatingRootContext,
		{
			mouseOnly: true,
			move: false,
			handleClose: safePolygon(),
			delay: () => ({ open: delayWithDefault, close: closeDelayWithDefault }),
			triggerElementRef,
			isActiveTrigger: isTriggerActive,
			isClosing: () => store.select('transitionStatus') === 'ending',
		},
		subSlot(slot, 'hover'),
	);

	const focusProps = useFocus(
		floatingRootContext,
		{ delay: delayWithDefault },
		subSlot(slot, 'focus'),
	);

	const state = { open: isOpenedByThisTrigger };

	const rootTriggerProps = store.useState(
		'triggerProps',
		subSlot(slot, 'tp'),
		isMountedByThisTrigger,
	);
	const inlineRectTriggerProps = getInlineRectTriggerProps(
		inlineRectCoordsRef,
		isOpenedByThisTrigger,
	);

	return useRenderElement(
		'a',
		{ render, className, style },
		{
			state,
			ref: [ref, registerTrigger, triggerElementRef],
			props: [
				hoverProps,
				focusProps.reference,
				rootTriggerProps,
				inlineRectTriggerProps,
				{ id: thisTriggerId },
				elementProps,
			],
			stateAttributesMapping: triggerOpenStateMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Portal ------------------------------------------------------------------

function PreviewCardPortal(props: any): any {
	const slot = S('PreviewCardPortal');
	const { keepMounted = false, ref, ...portalProps } = props;

	const store = usePreviewCardRootContext() as PreviewCardStore<any>;
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));

	if (!(mounted || keepMounted)) {
		return null;
	}

	return createElement(PreviewCardPortalContext.Provider, {
		value: keepMounted,
		children: createElement(FloatingPortalLite, { ref, ...portalProps }),
	});
}

// --- Positioner --------------------------------------------------------------

function PreviewCardPositioner(componentProps: any): any {
	const slot = S('PreviewCardPositioner');
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

	const store = usePreviewCardRootContext() as PreviewCardStore<any>;
	const keepMounted = usePreviewCardPortalContext();
	const nodeId = useFloatingNodeId(undefined, subSlot(slot, 'nodeId'));

	const open = store.useState('open', subSlot(slot, 'open'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const instantType = store.useState('instantType', subSlot(slot, 'instant'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const hasViewport = store.useState('hasViewport', subSlot(slot, 'viewport'));
	const inlineRectCoordsRef = store.context.inlineRectCoordsRef;

	const inlineMiddleware = useMemo(
		() => createInlineMiddleware(inlineRectCoordsRef),
		[inlineRectCoordsRef],
		subSlot(slot, 'inline'),
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
			inline: inlineMiddleware,
		},
		subSlot(slot, 'pos'),
	);
	const updatePosition = positioning.update;

	useLayoutEffect(
		() => {
			if (open && mounted) {
				updatePosition();
			}
		},
		[open, mounted, updatePosition],
		subSlot(slot, 'l:update'),
	);

	const state = {
		open,
		side: positioning.side,
		align: positioning.align,
		anchorHidden: positioning.anchorHidden,
		instant: instantType,
	};

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
			inert: !open,
		},
		subSlot(slot, 'positioner'),
	);

	return createElement(PreviewCardPositionerContext.Provider, {
		value: positioning as PreviewCardPositionerContextValue,
		children: createElement(FloatingNode, { id: nodeId, children: element }),
	});
}

// --- Popup -------------------------------------------------------------------

const popupStateAttributesMapping: StateAttributesMapping<any> = {
	...(popupStateMapping as StateAttributesMapping<any>),
	...(transitionStatusMapping as StateAttributesMapping<any>),
};

function PreviewCardPopup(componentProps: any): any {
	const slot = S('PreviewCardPopup');
	const { className, render, style, ref, ...elementProps } = componentProps;

	const store = usePreviewCardRootContext() as PreviewCardStore<any>;
	const { side, align } = usePreviewCardPositionerContext();

	const open = store.useState('open', subSlot(slot, 'open'));
	const instantType = store.useState('instantType', subSlot(slot, 'instant'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const popupProps = store.useState('popupProps', subSlot(slot, 'pp'));
	const floatingContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));

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

	// The close delay lives on the store so the active trigger owns it.
	const getCloseDelay = useStableCallback(
		() => store.context.closeDelayRef.current,
		subSlot(slot, 'gcd'),
	);

	useHoverFloatingInteraction(
		floatingContext,
		{ closeDelay: getCloseDelay },
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

// --- Backdrop ----------------------------------------------------------------

function PreviewCardBackdrop(componentProps: any): any {
	const slot = S('PreviewCardBackdrop');
	const { render, className, style, ref, ...elementProps } = componentProps;

	const store = usePreviewCardRootContext() as PreviewCardStore<any>;
	const open = store.useState('open', subSlot(slot, 'open'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));

	const state = { open, transitionStatus };

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [ref],
			props: [
				{
					role: 'presentation',
					hidden: !mounted,
					style: { pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none' },
				},
				elementProps,
			],
			stateAttributesMapping: popupStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Arrow -------------------------------------------------------------------

function PreviewCardArrow(componentProps: any): any {
	const slot = S('PreviewCardArrow');
	const { render, className, style, ref, ...elementProps } = componentProps;

	const store = usePreviewCardRootContext() as PreviewCardStore<any>;
	const { arrowRef, side, align, arrowUncentered, arrowStyles } = usePreviewCardPositionerContext();

	const open = store.useState('open', subSlot(slot, 'open'));

	const state = { open, side, align, uncentered: arrowUncentered };

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [arrowRef, ref],
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

function PreviewCardViewport(componentProps: any): any {
	const slot = S('PreviewCardViewport');
	const { render, className, style, children, ref, ...elementProps } = componentProps;

	const store = usePreviewCardRootContext() as PreviewCardStore<any>;
	const positioner = usePreviewCardPositionerContext();

	const instantType = store.useState('instantType', subSlot(slot, 'instant'));

	const { children: childrenToRender, state: viewportState } = usePopupViewport(
		{ store, side: positioner.side, cssVars: PreviewCardViewportCssVars, children },
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

export const PreviewCard = {
	Root: PreviewCardRoot,
	Trigger: PreviewCardTrigger,
	Portal: PreviewCardPortal,
	Positioner: PreviewCardPositioner,
	Popup: PreviewCardPopup,
	Backdrop: PreviewCardBackdrop,
	Arrow: PreviewCardArrow,
	Viewport: PreviewCardViewport,
	createHandle: createPreviewCardHandle,
	Handle: PreviewCardHandle,
};
