// Ported from .base-ui/packages/react/src/dialog/ (v1.6.0): store/DialogStore + store/DialogHandle,
// root (context/useDialogRoot/useRenderDialogRoot/DialogRoot + DialogInteractions), trigger, portal,
// backdrop, popup, title, description, close. octane adaptations: forwardRef → ref-as-prop; native
// events; every Store hook-method + hook threads an explicit slot; `React.createContext` →
// octane `createContext`.
//
// `DialogPortal`/`DialogPopup` use Base UI's own FloatingPortal + FloatingFocusManager (ported to
// `utils/floating/`, emitting `data-base-ui-*`) fed the FloatingRootStore directly as `context`.
import {
	createContext,
	createElement,
	useContext,
	useMemo,
	useRef,
	useState,
	useEffect,
	useCallback,
	useImperativeHandle,
	isChildrenBlock,
} from 'octane';
import { FloatingFocusManager } from './utils/floating/FloatingFocusManager';
import { FloatingPortal } from './utils/floating/FloatingPortal';

import { S, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import { useButton } from './utils/useButton';
import { useBaseUiId } from './utils/useBaseUiId';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { ReactStore } from './utils/store/ReactStore';
import { createSelector } from './utils/store/createSelector';
import { useClick } from './utils/floating/useClick';
import { useDismiss } from './utils/floating/useDismiss';
import { useScrollLock } from './utils/useScrollLock';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';
import { useOpenMethodTriggerProps } from './utils/useOpenInteractionType';
import { triggerOpenStateMapping, popupStateMapping } from './utils/popupStateMapping';
import { transitionStatusMapping } from './utils/useTransitionStatus';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { EMPTY_OBJECT } from './utils/empty';
import { inertValue } from './utils/inertValue';
import { InternalBackdrop } from './utils/InternalBackdrop';
import { contains, getTarget } from './utils/floating/element';
import { COMPOSITE_KEYS } from './utils/composite/keys';
import {
	createInitialPopupStoreState,
	createPopupFloatingRootContext,
	popupStoreSelectors,
	setPopupOpenState,
	usePopupStore,
	useImplicitActiveTrigger,
	useOpenStateTransitions,
	usePopupRootSync,
	usePopupInteractionProps,
	useTriggerDataForwarding,
	createDefaultInitialFocus,
	FOCUSABLE_POPUP_PROPS,
	type PopupStoreState,
	type PopupStoreContext,
} from './utils/popups';
import { PopupTriggerMap } from './utils/popups/popupTriggerMap';
import type { InteractionType } from './utils/useEnhancedClickHandler';

const CLICK_TRIGGER_IDENTIFIER = 'data-base-ui-click-trigger';

const popupStateAttributesMapping: StateAttributesMapping<any> = {
	...(popupStateMapping as StateAttributesMapping<any>),
	...(transitionStatusMapping as StateAttributesMapping<any>),
};

// --- Store -------------------------------------------------------------------

export type DialogState<Payload> = PopupStoreState<Payload> & {
	modal: boolean | 'trap-focus';
	disablePointerDismissal: boolean;
	openMethod: InteractionType | null;
	nested: boolean;
	nestedOpenDialogCount: number;
	nestedOpenDrawerCount: number;
	titleElementId: string | undefined;
	descriptionElementId: string | undefined;
	viewportElement: HTMLElement | null;
	role: 'dialog' | 'alertdialog';
};

type DialogContext = PopupStoreContext<any> & {
	readonly popupRef: { current: HTMLElement | null };
	readonly backdropRef: { current: HTMLDivElement | null };
	readonly internalBackdropRef: { current: HTMLDivElement | null };
	readonly outsidePressEnabledRef: { current: boolean };
	onNestedDialogOpen?: ((dialogCount: number, drawerCount: number) => void) | undefined;
	onNestedDialogClose?: (() => void) | undefined;
};

const dialogSelectors = {
	...popupStoreSelectors,
	modal: createSelector((state: DialogState<unknown>) => state.modal),
	nested: createSelector((state: DialogState<unknown>) => state.nested),
	nestedOpenDialogCount: createSelector(
		(state: DialogState<unknown>) => state.nestedOpenDialogCount,
	),
	nestedOpenDrawerCount: createSelector(
		(state: DialogState<unknown>) => state.nestedOpenDrawerCount,
	),
	disablePointerDismissal: createSelector(
		(state: DialogState<unknown>) => state.disablePointerDismissal,
	),
	openMethod: createSelector((state: DialogState<unknown>) => state.openMethod),
	descriptionElementId: createSelector((state: DialogState<unknown>) => state.descriptionElementId),
	titleElementId: createSelector((state: DialogState<unknown>) => state.titleElementId),
	viewportElement: createSelector((state: DialogState<unknown>) => state.viewportElement),
	role: createSelector((state: DialogState<unknown>) => state.role),
};

function createInitialDialogState<Payload>(
	initialState: Partial<DialogState<Payload>> = {},
): DialogState<Payload> {
	return {
		...createInitialPopupStoreState<Payload>(),
		modal: true,
		disablePointerDismissal: false,
		popupElement: null,
		viewportElement: null,
		descriptionElementId: undefined,
		titleElementId: undefined,
		openMethod: null,
		nested: false,
		nestedOpenDialogCount: 0,
		nestedOpenDrawerCount: 0,
		role: 'dialog',
		...initialState,
	};
}

export class DialogStore<Payload> extends ReactStore<
	Readonly<DialogState<Payload>>,
	DialogContext,
	typeof dialogSelectors
> {
	constructor(
		initialState?: Partial<DialogState<Payload>>,
		floatingId?: string | undefined,
		nested = false,
	) {
		const triggerElements = new PopupTriggerMap();
		const state = createInitialDialogState<Payload>(initialState);
		state.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);

		super(
			state,
			{
				popupRef: { current: null },
				backdropRef: { current: null },
				internalBackdropRef: { current: null },
				outsidePressEnabledRef: { current: true },
				triggerElements,
				onOpenChange: undefined,
				onOpenChangeComplete: undefined,
			} as DialogContext,
			dialogSelectors,
		);
	}

	setOpen = (nextOpen: boolean, eventDetails: any) => {
		eventDetails.preventUnmountOnClose = () => {
			this.set('preventUnmountingOnClose', true);
		};

		if (!nextOpen && eventDetails.trigger == null && this.state.activeTriggerId != null) {
			eventDetails.trigger = this.state.activeTriggerElement ?? undefined;
		}

		this.context.onOpenChange?.(nextOpen, eventDetails);

		if (eventDetails.isCanceled) {
			return;
		}

		(this.state.floatingRootContext as any).dispatchOpenChange(nextOpen, eventDetails);

		const updatedState: Partial<DialogState<Payload>> = { open: nextOpen };
		setPopupOpenState(updatedState as any, nextOpen, eventDetails.trigger);
		this.update(updatedState);
	};

	static useStore<Payload>(
		externalStore: DialogStore<Payload> | undefined,
		initialState: Partial<DialogState<Payload>>,
		slot: symbol | undefined,
	): DialogStore<Payload> {
		return usePopupStore(
			externalStore as any,
			(floatingId, nested) => new DialogStore<Payload>(initialState, floatingId, nested) as any,
			true,
			slot,
		).store as unknown as DialogStore<Payload>;
	}
}

// --- Handle ------------------------------------------------------------------

export class DialogHandle<Payload> {
	readonly store: DialogStore<Payload>;

	constructor(store?: DialogStore<Payload>) {
		this.store = store ?? new DialogStore<Payload>();
	}

	open(triggerId: string | null) {
		const triggerElement = triggerId
			? (this.store.context.triggerElements.getById(triggerId) as HTMLElement | undefined)
			: undefined;
		this.store.setOpen(
			true,
			createChangeEventDetails(REASONS.imperativeAction, undefined, triggerElement),
		);
	}

	openWithPayload(payload: Payload) {
		this.store.set('payload', payload);
		this.store.setOpen(
			true,
			createChangeEventDetails(REASONS.imperativeAction, undefined, undefined),
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

export function createDialogHandle<Payload>(): DialogHandle<Payload> {
	return new DialogHandle<Payload>();
}

// --- Context -----------------------------------------------------------------

export interface DialogRootContextValue<Payload = unknown> {
	store: DialogStore<Payload>;
}

const IsDrawerContext = createContext(false);
const DialogRootContext = createContext<DialogRootContextValue | undefined>(undefined);

export function useDialogRootContext(optional?: boolean): DialogRootContextValue | undefined {
	const dialogRootContext = useContext(DialogRootContext);
	if (optional === false && dialogRootContext === undefined) {
		throw new Error(
			'Base UI: DialogRootContext is missing. Dialog parts must be placed within <Dialog.Root>.',
		);
	}
	return dialogRootContext;
}

// --- Root --------------------------------------------------------------------

function useDialogRoot(
	params: { store: DialogStore<any>; actionsRef?: any },
	slot: symbol | undefined,
) {
	const { store, actionsRef } = params;

	const open = store.useState('open', subSlot(slot, 'open'));
	usePopupRootSync(store as any, open, subSlot(slot, 'rootSync'));
	useImplicitActiveTrigger(store as any, {}, subSlot(slot, 'iat'));
	const { forceUnmount } = useOpenStateTransitions(
		open,
		store as any,
		undefined,
		subSlot(slot, 'ost'),
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
}

// Runs the open-state floating interactions (dismiss + scroll lock + nested-dialog bookkeeping),
// and syncs the resulting prop bags into the store. Rendered only when `open || mounted`.
function DialogInteractions(props: any): any {
	const slot = S('DialogInteractions');
	const { store, parentContext, isDrawer } = props;

	const open = store.useState('open', subSlot(slot, 'open'));
	const disablePointerDismissal = store.useState('disablePointerDismissal', subSlot(slot, 'dpd'));
	const modal = store.useState('modal', subSlot(slot, 'modal'));
	const popupElement = store.useState('popupElement', subSlot(slot, 'pel'));
	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));

	const [ownNestedOpenDialogs, setOwnNestedOpenDialogs] = useState(0, subSlot(slot, 'nod'));
	const [ownNestedOpenDrawers, setOwnNestedOpenDrawers] = useState(0, subSlot(slot, 'ndr'));
	const isTopmost = ownNestedOpenDialogs === 0;

	const dismiss = useDismiss(
		floatingRootContext,
		{
			outsidePressEvent() {
				if (store.context.internalBackdropRef.current || store.context.backdropRef.current) {
					return 'intentional';
				}
				return {
					mouse: modal === 'trap-focus' ? 'sloppy' : 'intentional',
					touch: 'sloppy',
				};
			},
			outsidePress(event: any) {
				if (!store.context.outsidePressEnabledRef.current) {
					return false;
				}
				if ('button' in event && event.button !== 0) {
					return false;
				}
				if ('touches' in event && event.touches.length !== 1) {
					return false;
				}
				const target = getTarget(event) as Element | null;
				if (isTopmost && !disablePointerDismissal) {
					if (modal) {
						return store.context.internalBackdropRef.current || store.context.backdropRef.current
							? store.context.internalBackdropRef.current === target ||
									store.context.backdropRef.current === target ||
									(contains(target, popupElement) && !target?.hasAttribute('data-base-ui-portal'))
							: true;
					}
					return true;
				}
				return false;
			},
			escapeKey: isTopmost,
		},
		subSlot(slot, 'dismiss'),
	);

	useScrollLock(open && modal === true, popupElement, subSlot(slot, 'scroll'));

	store.useContextCallback(
		'onNestedDialogOpen',
		(dialogCount: number, drawerCount: number) => {
			setOwnNestedOpenDialogs(dialogCount);
			setOwnNestedOpenDrawers(drawerCount);
		},
		subSlot(slot, 'cc-open'),
	);
	store.useContextCallback(
		'onNestedDialogClose',
		() => {
			setOwnNestedOpenDialogs(0);
			setOwnNestedOpenDrawers(0);
		},
		subSlot(slot, 'cc-close'),
	);

	useEffect(
		() => {
			if (parentContext?.onNestedDialogOpen && open) {
				parentContext.onNestedDialogOpen(
					ownNestedOpenDialogs + 1,
					ownNestedOpenDrawers + (isDrawer ? 1 : 0),
				);
			}
			if (parentContext?.onNestedDialogClose && !open) {
				parentContext.onNestedDialogClose();
			}
			return () => {
				if (parentContext?.onNestedDialogClose && open) {
					parentContext.onNestedDialogClose();
				}
			};
		},
		[isDrawer, open, ownNestedOpenDialogs, ownNestedOpenDrawers, parentContext],
		subSlot(slot, 'e:parent'),
	);

	const activeTriggerProps = dismiss.reference ?? EMPTY_OBJECT;
	const inactiveTriggerProps = dismiss.trigger ?? EMPTY_OBJECT;
	const popupProps = dismiss.floating ?? EMPTY_OBJECT;

	usePopupInteractionProps(
		store,
		{
			activeTriggerProps,
			inactiveTriggerProps,
			popupProps,
			nestedOpenDialogCount: ownNestedOpenDialogs,
			nestedOpenDrawerCount: ownNestedOpenDrawers,
		} as any,
		subSlot(slot, 'pip'),
	);

	// Renders the Dialog's children (see the note at the `content` call site). No DOM of its own.
	return props.children ?? null;
}

// Passthrough used when the interactions aren't mounted, to keep the Provider's children a stable
// element-descriptor shape (see the note at the `content` call site).
function DialogChildren(props: any): any {
	return props.children ?? null;
}

function useRenderDialogRoot<Payload>(props: any, mode: 'dialog' | 'drawer' | 'alert-dialog') {
	const slot = S('DialogRoot');
	const {
		children,
		open: openProp,
		defaultOpen = false,
		onOpenChange,
		onOpenChangeComplete,
		disablePointerDismissal: disablePointerDismissalProp = false,
		modal: modalProp = true,
		actionsRef,
		handle,
		triggerId: triggerIdProp,
		defaultTriggerId: defaultTriggerIdProp = null,
	} = props;

	const isDrawer = mode === 'drawer';
	const isAlertDialog = mode === 'alert-dialog';
	const modal = isAlertDialog ? true : modalProp;
	const disablePointerDismissal = isAlertDialog || disablePointerDismissalProp;
	const role: 'dialog' | 'alertdialog' = isAlertDialog ? 'alertdialog' : 'dialog';

	const parentDialogRootContext = useDialogRootContext(true) as DialogRootContextValue | undefined;
	const nested = Boolean(parentDialogRootContext);
	const rootState = { modal, disablePointerDismissal, nested, role };

	const store = DialogStore.useStore<Payload>(
		handle?.store,
		{
			open: defaultOpen,
			openProp,
			activeTriggerId: defaultTriggerIdProp,
			triggerIdProp,
			...rootState,
		} as Partial<DialogState<Payload>>,
		subSlot(slot, 'store'),
	);

	store.useControlledProp('openProp', openProp, subSlot(slot, 'cp-open'));
	store.useControlledProp('triggerIdProp', triggerIdProp, subSlot(slot, 'cp-tid'));

	store.useSyncedValues(rootState as any, subSlot(slot, 'sv-root'));
	store.useContextCallback('onOpenChange', onOpenChange, subSlot(slot, 'cc-change'));
	store.useContextCallback(
		'onOpenChangeComplete',
		onOpenChangeComplete,
		subSlot(slot, 'cc-complete'),
	);

	const open = store.useState('open', subSlot(slot, 'open'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const payload = store.useState('payload', subSlot(slot, 'payload')) as Payload | undefined;

	useDialogRoot({ store, actionsRef }, subSlot(slot, 'root'));

	const shouldRenderInteractions = open || mounted;

	const contextValue = useMemo(() => ({ store }), [store], subSlot(slot, 'ctx'));

	// Base UI's `children` may be a payload render function (`{({ payload }) => …}`). octane passes
	// a render-prop child RAW but compiles element/text children to a `markChildrenBlock`-tagged
	// render fn — both are `typeof === 'function'`, so `isChildrenBlock` excludes the latter.
	const resolvedChildren =
		typeof children === 'function' && !isChildrenBlock(children) ? children({ payload }) : children;

	// The Provider's `children` must stay a STABLE shape (always an element descriptor) across
	// renders: octane's `childrenAsBody` runs a render-FUNCTION child directly in the Provider scope
	// (owning `scope.slots`) but routes a DESCRIPTOR child through `childSlot(scope, 0)` — alternating
	// the two across renders (a raw children-block when closed vs a component when open) collides those
	// slot namespaces and crashes octane's reconciler (see octane bug note). So a no-DOM component
	// wraps the children in BOTH states: `DialogInteractions` (runs the open-state hooks) when
	// open/mounted, else `DialogChildren` (a passthrough). Both just render `props.children`.
	const content = createElement(shouldRenderInteractions ? DialogInteractions : DialogChildren, {
		store,
		parentContext: parentDialogRootContext?.store.context,
		isDrawer,
		children: resolvedChildren,
	});

	return createElement(IsDrawerContext.Provider, {
		value: false,
		children: createElement(DialogRootContext.Provider, {
			value: contextValue as DialogRootContextValue,
			children: content,
		}),
	});
}

function DialogRoot<Payload>(props: any): any {
	const mode = useContext(IsDrawerContext) ? 'drawer' : 'dialog';
	return useRenderDialogRoot<Payload>(props, mode);
}

// --- Trigger -----------------------------------------------------------------

function DialogTrigger(componentProps: any): any {
	const slot = S('DialogTrigger');
	const {
		render,
		className,
		style,
		disabled = false,
		nativeButton = true,
		id: idProp,
		payload,
		handle,
		ref,
		...elementProps
	} = componentProps;

	const dialogRootContext = useDialogRootContext(true);
	const store = (handle?.store ?? dialogRootContext?.store) as DialogStore<any> | undefined;
	if (!store) {
		throw new Error(
			'Base UI: <Dialog.Trigger> must be used within <Dialog.Root> or provided with a handle.',
		);
	}

	const thisTriggerId = useBaseUiId(idProp, subSlot(slot, 'id'));
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
		{ payload } as any,
		subSlot(slot, 'tdf'),
	);

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton },
		subSlot(slot, 'btn'),
	);

	const click = useClick(
		floatingContext,
		{ enabled: floatingContext != null },
		subSlot(slot, 'click'),
	);
	const interactionTypeProps = useOpenMethodTriggerProps(
		() => store.select('open'),
		(interactionType) => {
			store.set('openMethod', interactionType);
		},
		subSlot(slot, 'omt'),
	);

	const state = { disabled, open: isOpenedByThisTrigger };

	const rootTriggerProps = store.useState(
		'triggerProps',
		subSlot(slot, 'tp'),
		isMountedByThisTrigger,
	);

	return useRenderElement(
		'button',
		{ render, className, style },
		{
			state,
			ref: [buttonRef, ref, registerTrigger, triggerElementRef],
			props: [
				click.reference,
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
			stateAttributesMapping: triggerOpenStateMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Portal ------------------------------------------------------------------

const DialogPortalContext = createContext<boolean | undefined>(undefined);

function useDialogPortalContext(): boolean {
	const value = useContext(DialogPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <Dialog.Portal> is missing.');
	}
	return value;
}

function DialogPortal(props: any): any {
	const slot = S('DialogPortal');
	const { keepMounted = false, container, children, ...portalProps } = props;

	const { store } = useDialogRootContext() as DialogRootContextValue;
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const modal = store.useState('modal', subSlot(slot, 'modal'));
	const open = store.useState('open', subSlot(slot, 'open'));

	const shouldRender = mounted || keepMounted;
	if (!shouldRender) {
		return null;
	}

	return createElement(DialogPortalContext.Provider, {
		value: keepMounted,
		children: createElement(FloatingPortal, {
			container,
			children: [
				mounted && modal === true
					? createElement(InternalBackdrop, {
							ref: store.context.internalBackdropRef,
							inert: inertValue(!open),
						})
					: null,
				children,
			],
		}),
	});
}

// --- Backdrop ----------------------------------------------------------------

function DialogBackdrop(componentProps: any): any {
	const slot = S('DialogBackdrop');
	const { render, className, style, forceRender = false, ref, ...elementProps } = componentProps;
	const { store } = useDialogRootContext() as DialogRootContextValue;

	const open = store.useState('open', subSlot(slot, 'open'));
	const nested = store.useState('nested', subSlot(slot, 'nested'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'ts'));

	const state = { open, transitionStatus };

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [store.context.backdropRef, ref],
			stateAttributesMapping: popupStateAttributesMapping,
			props: [
				{
					role: 'presentation',
					hidden: !mounted,
					style: { userSelect: 'none', WebkitUserSelect: 'none' },
				},
				elementProps,
			],
			enabled: forceRender || !nested,
		},
		subSlot(slot, 're'),
	);
}

// --- Popup -------------------------------------------------------------------

function DialogPopup(componentProps: any): any {
	const slot = S('DialogPopup');
	const { render, className, style, finalFocus, initialFocus, ref, ...elementProps } =
		componentProps;

	const { store } = useDialogRootContext() as DialogRootContextValue;

	const descriptionElementId = store.useState('descriptionElementId', subSlot(slot, 'did'));
	const disablePointerDismissal = store.useState('disablePointerDismissal', subSlot(slot, 'dpd'));
	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const rootPopupProps = store.useState('popupProps', subSlot(slot, 'pp'));
	const modal = store.useState('modal', subSlot(slot, 'modal'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const nested = store.useState('nested', subSlot(slot, 'nested'));
	const nestedOpenDialogCount = store.useState('nestedOpenDialogCount', subSlot(slot, 'nodc'));
	const open = store.useState('open', subSlot(slot, 'open'));
	const openMethod = store.useState('openMethod', subSlot(slot, 'om'));
	const titleElementId = store.useState('titleElementId', subSlot(slot, 'tid'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'ts'));
	const role = store.useState('role', subSlot(slot, 'role'));
	const floatingId = floatingRootContext.useState('floatingId', subSlot(slot, 'fid'));

	const popupId = elementProps.id ?? floatingId;

	useDialogPortalContext();

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

	const resolvedInitialFocus =
		initialFocus === undefined ? createDefaultInitialFocus(store.context.popupRef) : initialFocus;

	const nestedDialogOpen = nestedOpenDialogCount > 0;
	const setPopupElement = store.useStateSetter('popupElement', subSlot(slot, 'spe'));

	const state = { open, nested, transitionStatus, nestedDialogOpen };

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			props: [
				rootPopupProps,
				{
					id: popupId,
					'aria-labelledby': titleElementId ?? undefined,
					'aria-describedby': descriptionElementId ?? undefined,
					role,
					...FOCUSABLE_POPUP_PROPS,
					hidden: !mounted,
					onKeyDown(event: any) {
						if (COMPOSITE_KEYS.has(event.key)) {
							event.stopPropagation();
						}
					},
					style: { ['--nested-dialogs']: nestedOpenDialogCount },
				},
				elementProps,
			],
			ref: [ref, store.context.popupRef, setPopupElement],
			stateAttributesMapping: popupStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	return createElement(FloatingFocusManager, {
		context: floatingRootContext,
		openInteractionType: openMethod,
		disabled: !mounted,
		closeOnFocusOut: !disablePointerDismissal,
		initialFocus: resolvedInitialFocus,
		returnFocus: finalFocus,
		modal: modal !== false,
		restoreFocus: 'popup',
		children: element,
	});
}

// --- Title / Description / Close ---------------------------------------------

function DialogTitle(componentProps: any): any {
	const slot = S('DialogTitle');
	const { render, className, style, id: idProp, ref, ...elementProps } = componentProps;
	const { store } = useDialogRootContext() as DialogRootContextValue;
	const id = useBaseUiId(idProp, subSlot(slot, 'id'));
	store.useSyncedValueWithCleanup('titleElementId', id, subSlot(slot, 'sync'));
	return useRenderElement(
		'h2',
		{ render, className, style },
		{ ref, props: [{ id }, elementProps] },
		subSlot(slot, 're'),
	);
}

function DialogDescription(componentProps: any): any {
	const slot = S('DialogDescription');
	const { render, className, style, id: idProp, ref, ...elementProps } = componentProps;
	const { store } = useDialogRootContext() as DialogRootContextValue;
	const id = useBaseUiId(idProp, subSlot(slot, 'id'));
	store.useSyncedValueWithCleanup('descriptionElementId', id, subSlot(slot, 'sync'));
	return useRenderElement(
		'p',
		{ render, className, style },
		{ ref, props: [{ id }, elementProps] },
		subSlot(slot, 're'),
	);
}

function DialogClose(componentProps: any): any {
	const slot = S('DialogClose');
	const {
		render,
		className,
		style,
		disabled = false,
		nativeButton = true,
		ref,
		...elementProps
	} = componentProps;
	const { store } = useDialogRootContext() as DialogRootContextValue;
	const open = store.useState('open', subSlot(slot, 'open'));

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton },
		subSlot(slot, 'btn'),
	);

	const state = { disabled };

	function handleClick(event: any) {
		if (open) {
			store.setOpen(false, createChangeEventDetails(REASONS.closePress, event));
		}
	}

	return useRenderElement(
		'button',
		{ render, className, style },
		{
			state,
			ref: [ref, buttonRef],
			props: [{ onClick: handleClick }, elementProps, getButtonProps],
		},
		subSlot(slot, 're'),
	);
}

// --- Namespace ---------------------------------------------------------------

export const Dialog = {
	Root: DialogRoot,
	Trigger: DialogTrigger,
	Portal: DialogPortal,
	Backdrop: DialogBackdrop,
	Popup: DialogPopup,
	Title: DialogTitle,
	Description: DialogDescription,
	Close: DialogClose,
	createHandle: createDialogHandle,
};
