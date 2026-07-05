// Ported from .base-ui/packages/react/src/dialog/ (v1.6.0): store/DialogStore + store/DialogHandle,
// root/DialogRootContext + root/useDialogRoot + root/useRenderDialogRoot + root/DialogRoot,
// trigger/DialogTrigger — the CLOSED-state path (Root + Trigger). octane adaptations: forwardRef →
// ref-as-prop; native events; every Store hook-method + hook threads an explicit slot; `React.
// createContext` → octane `createContext`.
//
// NOTE: `DialogInteractions` (the open-state floating interactions: useDismiss + scroll-lock +
// focus) is STUBBED here — it is only rendered when `open || mounted`, so a closed dialog never
// mounts it, and the differential vs real Base UI matches (React also doesn't render it closed).
// The Portal/Backdrop/Popup/Title/Description/Close parts + the real DialogInteractions land with
// the `useDismiss`/`FloatingFocusManager`/`FloatingPortal` layer.
import {
	createContext,
	createElement,
	useContext,
	useMemo,
	useRef,
	useCallback,
	useImperativeHandle,
	isChildrenBlock,
} from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import { useButton } from './utils/useButton';
import { useBaseUiId } from './utils/useBaseUiId';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { ReactStore } from './utils/store/ReactStore';
import { createSelector } from './utils/store/createSelector';
import { useClick } from './utils/floating/useClick';
import { useOpenMethodTriggerProps } from './utils/useOpenInteractionType';
import { triggerOpenStateMapping } from './utils/popupStateMapping';
import {
	createInitialPopupStoreState,
	createPopupFloatingRootContext,
	popupStoreSelectors,
	setPopupOpenState,
	usePopupStore,
	useImplicitActiveTrigger,
	useOpenStateTransitions,
	usePopupRootSync,
	useTriggerDataForwarding,
	type PopupStoreState,
	type PopupStoreContext,
} from './utils/popups';
import { PopupTriggerMap } from './utils/popups/popupTriggerMap';
import type { InteractionType } from './utils/useEnhancedClickHandler';

const CLICK_TRIGGER_IDENTIFIER = 'data-base-ui-click-trigger';

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

// STUB — see file header. The real open-state interactions land with the useDismiss layer.
function DialogInteractions(_props: any): any {
	return null;
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

	const interactions = shouldRenderInteractions
		? createElement(DialogInteractions, {
				store,
				parentContext: parentDialogRootContext?.store.context,
				isDrawer,
			})
		: null;

	return createElement(IsDrawerContext.Provider, {
		value: false,
		children: createElement(DialogRootContext.Provider, {
			value: contextValue as DialogRootContextValue,
			children: interactions ? [interactions, resolvedChildren] : resolvedChildren,
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

// --- Namespace (Portal/Backdrop/Popup/Title/Description/Close/Viewport land later) ---

export const Dialog = {
	Root: DialogRoot,
	Trigger: DialogTrigger,
	createHandle: createDialogHandle,
};
