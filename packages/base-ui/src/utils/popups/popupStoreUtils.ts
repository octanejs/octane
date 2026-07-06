// Ported from .base-ui/packages/react/src/utils/popups/popupStoreUtils.ts (v1.6.0), octane-adapted.
// The shared hooks + helpers every popup Root/Trigger/Popup routes through: store creation +
// floating-root sync (`usePopupStore`), trigger registration, the open-change sequence
// (`applyPopupOpenChange`), mounted/transition management (`useOpenStateTransitions`), and interaction-
// prop syncing. octane adaptations: every hook threads an explicit slot; `useIsoLayoutEffect` →
// `useLayoutEffect`; `ReactDOM.flushSync` → octane `flushSync`; `useId` → `useBaseUiId`.
import { useRef, useCallback, useLayoutEffect, flushSync, useId } from 'octane';

import { subSlot } from '../../internal';
import { useStableCallback } from '../useStableCallback';
import { useOnFirstRender } from '../useOnFirstRender';
import { useTransitionStatus } from '../useTransitionStatus';
import { useOpenChangeComplete } from '../useOpenChangeComplete';
import { EMPTY_OBJECT } from '../empty';
import { FOCUSABLE_ATTRIBUTE } from '../floating/constants';
import { useFloatingParentNodeId } from '../floating/FloatingTree';
import { useSyncedFloatingRootContext } from '../floating/useSyncedFloatingRootContext';
import { createChangeEventDetails, REASONS } from '../createChangeEventDetails';
import type { ReactStore } from '../store/ReactStore';
import {
	PopupStoreState,
	PopupStoreContext,
	popupStoreSelectors,
	PopupStoreSelectors,
} from './store';

export type InteractionType = 'mouse' | 'touch' | 'pen' | 'keyboard';

export const FOCUSABLE_POPUP_PROPS = {
	tabIndex: -1,
	[FOCUSABLE_ATTRIBUTE]: '',
};

/** The default `initialFocus` resolver: focus the popup itself when opened by touch, else default. */
export function createDefaultInitialFocus(popupRef: { current: HTMLElement | null }) {
	return (interactionType: InteractionType) =>
		interactionType === 'touch' ? popupRef.current : true;
}

type AnyPopupStore = ReactStore<any, PopupStoreContext<any>, PopupStoreSelectors> & {
	setOpen(open: boolean, eventDetails: any): void;
};

export function usePopupStore<Store extends AnyPopupStore>(
	externalStore: Store | undefined,
	createStore: (floatingId: string | undefined, nested: boolean) => Store,
	treatPopupAsFloatingElement: boolean,
	slot: symbol | undefined,
): { store: Store; internalStore: Store | null } {
	// Raw `useId` (no `base-ui-` prefix), matching Base UI's `@base-ui/utils/useId`.
	const floatingId = useId(subSlot(slot, 'fid'));
	const nested = useFloatingParentNodeId() != null;

	const internalStoreRef = useRef<Store | null>(null, subSlot(slot, 'store'));
	if (externalStore === undefined && internalStoreRef.current === null) {
		internalStoreRef.current = createStore(floatingId, nested);
	}

	const store = externalStore ?? internalStoreRef.current!;

	useSyncedFloatingRootContext(
		{
			popupStore: store,
			treatPopupAsFloatingElement,
			floatingRootContext: store.state.floatingRootContext,
			floatingId,
			nested,
			onOpenChange: store.setOpen,
		},
		subSlot(slot, 'synced'),
	);

	return { store, internalStore: internalStoreRef.current };
}

/** A callback ref that registers/unregisters the trigger element in the store. */
export function useTriggerRegistration<State extends PopupStoreState<unknown>>(
	id: string | undefined,
	store: ReactStore<State, PopupStoreContext<never>, PopupStoreSelectors>,
	slot: symbol | undefined,
): (element: Element | null) => void {
	const registeredElementIdRef = useRef<string | null>(null, subSlot(slot, 'rid'));
	const registeredElementRef = useRef<Element | null>(null, subSlot(slot, 'rel'));

	return useCallback(
		(element: Element | null) => {
			if (id === undefined) {
				return;
			}

			let shouldSyncTriggerCount = false;

			if (registeredElementIdRef.current !== null) {
				const registeredId = registeredElementIdRef.current;
				const registeredElement = registeredElementRef.current;
				const currentElement = store.context.triggerElements.getById(registeredId);

				if (registeredElement && currentElement === registeredElement) {
					store.context.triggerElements.delete(registeredId);
					shouldSyncTriggerCount = true;
				}

				registeredElementIdRef.current = null;
				registeredElementRef.current = null;
			}

			if (element !== null) {
				registeredElementIdRef.current = id;
				registeredElementRef.current = element;
				store.context.triggerElements.add(id, element);
				shouldSyncTriggerCount = true;
			}

			if (shouldSyncTriggerCount) {
				const triggerCount = store.context.triggerElements.size;
				if (store.select('open') && store.state.triggerCount !== triggerCount) {
					store.set('triggerCount', triggerCount);
				}
			}
		},
		[store, id],
		subSlot(slot, 'cb'),
	);
}

export function setPopupOpenState(
	state: Partial<PopupStoreState<unknown>>,
	open: boolean,
	trigger: Element | undefined,
	preventUnmountOnClose = false,
) {
	if (open) {
		state.preventUnmountingOnClose = false;
	} else if (preventUnmountOnClose) {
		state.preventUnmountingOnClose = true;
	}

	const triggerId = trigger?.id ?? null;

	if (triggerId || open) {
		state.activeTriggerId = triggerId;
		state.activeTriggerElement = trigger ?? null;
	}
}

export function attachPreventUnmountOnClose(eventDetails: { preventUnmountOnClose(): void }) {
	let preventUnmountOnClose = false;
	eventDetails.preventUnmountOnClose = () => {
		preventUnmountOnClose = true;
	};
	return () => preventUnmountOnClose;
}

/** The shared open-change sequence (notify → cancel-check → dispatch → commit). Non-hook. */
export function applyPopupOpenChange<
	State extends PopupStoreState<unknown> & {
		instantType?: 'delay' | 'dismiss' | 'focus' | undefined;
	},
>(
	store: {
		readonly context: Pick<PopupStoreContext<any>, 'onOpenChange'>;
		readonly state: Pick<PopupStoreState<unknown>, 'floatingRootContext'>;
		update(state: Partial<State>): void;
	},
	nextOpen: boolean,
	eventDetails: any & { preventUnmountOnClose(): void },
	options: {
		onBeforeDispatch?: (() => void) | undefined;
		extraState?: Partial<State> | undefined;
	} = {},
): void {
	const reason = eventDetails.reason;
	const isHover = reason === REASONS.triggerHover;
	const isFocusOpen = nextOpen && reason === REASONS.triggerFocus;
	const isDismissClose =
		!nextOpen && (reason === REASONS.triggerPress || reason === REASONS.escapeKey);

	const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(eventDetails);

	store.context.onOpenChange?.(nextOpen, eventDetails);

	if (eventDetails.isCanceled) {
		return;
	}

	options.onBeforeDispatch?.();

	store.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);

	const changeState = () => {
		const updatedState: Partial<PopupStoreState<unknown>> & {
			instantType?: 'delay' | 'dismiss' | 'focus' | undefined;
		} = { ...options.extraState, open: nextOpen };

		if (isFocusOpen) {
			updatedState.instantType = 'focus';
		} else if (isDismissClose) {
			updatedState.instantType = 'dismiss';
		} else if (isHover) {
			updatedState.instantType = undefined;
		}

		setPopupOpenState(updatedState, nextOpen, eventDetails.trigger, shouldPreventUnmountOnClose());
		store.update(updatedState as Partial<State>);
	};

	if (isHover) {
		flushSync(changeState);
	} else {
		changeState();
	}
}

export function useInitialOpenSync<State extends PopupStoreState<unknown>>(
	store: ReactStore<State, PopupStoreContext<never>, PopupStoreSelectors>,
	openProp: boolean | undefined,
	defaultOpen: boolean,
	defaultTriggerId: string | null,
	slot: symbol | undefined,
) {
	useOnFirstRender(
		() => {
			if (openProp === undefined && store.state.open === false && defaultOpen) {
				store.state = {
					...store.state,
					open: true,
					activeTriggerId: defaultTriggerId,
					preventUnmountingOnClose: false,
				};
			}
		},
		subSlot(slot, 'first'),
	);
}

export function useTriggerDataForwarding<State extends PopupStoreState<unknown>>(
	triggerId: string | undefined,
	triggerElementRef: { current: Element | null },
	store: ReactStore<State, PopupStoreContext<never>, typeof popupStoreSelectors>,
	stateUpdates: Partial<State>,
	slot: symbol | undefined,
) {
	const isMountedByThisTrigger = store.useState(
		'isMountedByTrigger',
		subSlot(slot, 'mbt'),
		triggerId,
	);

	const baseRegisterTrigger = useTriggerRegistration(triggerId, store, subSlot(slot, 'reg'));

	const registerTrigger = useStableCallback(
		(element: Element | null) => {
			baseRegisterTrigger(element);

			if (!element) {
				return;
			}

			const open = store.select('open');
			const activeTriggerId = store.select('activeTriggerId');

			if (activeTriggerId === triggerId) {
				store.update({
					activeTriggerElement: element,
					...(open ? stateUpdates : null),
				} as Partial<State>);
				return;
			}

			if (activeTriggerId == null && open) {
				store.update({
					activeTriggerId: triggerId,
					activeTriggerElement: element,
					...stateUpdates,
				} as Partial<State>);
			}
		},
		subSlot(slot, 'regcb'),
	);

	useLayoutEffect(
		() => {
			if (isMountedByThisTrigger) {
				store.update({
					activeTriggerElement: triggerElementRef.current,
					...stateUpdates,
				} as Partial<State>);
			}
		},
		[isMountedByThisTrigger, store, triggerElementRef, ...Object.values(stateUpdates)],
		subSlot(slot, 'e'),
	);

	return { registerTrigger, isMountedByThisTrigger };
}

export function useImplicitActiveTrigger<State extends PopupStoreState<unknown>>(
	store: ReactStore<State, PopupStoreContext<never>, typeof popupStoreSelectors> & {
		setOpen(open: boolean, eventDetails: any): void;
	},
	options: { closeOnActiveTriggerUnmount?: boolean | undefined },
	slot: symbol | undefined,
) {
	const { closeOnActiveTriggerUnmount = false } = options;
	const open = store.useState('open', subSlot(slot, 'open'));
	const reactiveTriggerCount = store.useState('triggerCount', subSlot(slot, 'tc'));

	useLayoutEffect(
		() => {
			if (!open) {
				if (store.state.triggerCount !== 0) {
					store.set('triggerCount', 0);
				}
				return;
			}

			const triggerCount = store.context.triggerElements.size;
			const stateUpdates: Partial<PopupStoreState<unknown>> = {};

			if (store.state.triggerCount !== triggerCount) {
				stateUpdates.triggerCount = triggerCount;
			}

			const activeTriggerId = store.select('activeTriggerId');
			let lostActiveTriggerId: string | null = null;

			if (activeTriggerId) {
				const activeTriggerElement = store.context.triggerElements.getById(activeTriggerId);
				if (!activeTriggerElement) {
					lostActiveTriggerId = activeTriggerId;
				} else if (activeTriggerElement !== store.state.activeTriggerElement) {
					stateUpdates.activeTriggerElement = activeTriggerElement;
				}
			}

			if (!lostActiveTriggerId && !activeTriggerId && triggerCount === 1) {
				const iteratorResult = store.context.triggerElements.entries().next();
				if (!iteratorResult.done) {
					const [implicitTriggerId, implicitTriggerElement] = iteratorResult.value;
					stateUpdates.activeTriggerId = implicitTriggerId;
					stateUpdates.activeTriggerElement = implicitTriggerElement;
				}
			}

			if (
				stateUpdates.triggerCount !== undefined ||
				stateUpdates.activeTriggerId !== undefined ||
				stateUpdates.activeTriggerElement !== undefined
			) {
				store.update(stateUpdates as Partial<State>);
			}

			if (lostActiveTriggerId) {
				if (closeOnActiveTriggerUnmount) {
					queueMicrotask(() => {
						if (
							store.select('open') &&
							store.select('activeTriggerId') === lostActiveTriggerId &&
							!store.context.triggerElements.getById(lostActiveTriggerId)
						) {
							const eventDetails = createChangeEventDetails(REASONS.none);
							store.setOpen(false, eventDetails);
							if (!eventDetails.isCanceled) {
								store.update({
									activeTriggerId: null,
									activeTriggerElement: null,
								} as Partial<State>);
							}
						}
					});
				}
			}
		},
		[open, store, reactiveTriggerCount, closeOnActiveTriggerUnmount],
		subSlot(slot, 'e'),
	);
}

export function useOpenStateTransitions<State extends PopupStoreState<unknown>>(
	open: boolean,
	store: ReactStore<State, PopupStoreContext<never>, typeof popupStoreSelectors>,
	onUnmount: (() => void) | undefined,
	slot: symbol | undefined,
) {
	const { mounted, setMounted, transitionStatus } = useTransitionStatus(
		open,
		undefined,
		undefined,
		subSlot(slot, 'ts'),
	);
	const preventUnmountingOnClose = store.useState(
		'preventUnmountingOnClose',
		subSlot(slot, 'puoc'),
	);
	const syncedPreventUnmountingOnClose = open ? false : preventUnmountingOnClose;

	store.useSyncedValues(
		{
			mounted,
			transitionStatus,
			preventUnmountingOnClose: syncedPreventUnmountingOnClose,
		} as Partial<State>,
		subSlot(slot, 'sync'),
	);

	const forceUnmount = useStableCallback(
		() => {
			setMounted(false);
			store.update({
				activeTriggerId: null,
				activeTriggerElement: null,
				mounted: false,
				preventUnmountingOnClose: false,
			} as Partial<State>);
			onUnmount?.();
			store.context.onOpenChangeComplete?.(false);
		},
		subSlot(slot, 'fu'),
	);

	useOpenChangeComplete(
		{
			enabled: mounted && !open && !syncedPreventUnmountingOnClose,
			open,
			ref: store.context.popupRef,
			onComplete() {
				if (!open) {
					forceUnmount();
				}
			},
		},
		subSlot(slot, 'occ'),
	);

	return { forceUnmount, transitionStatus };
}

export function usePopupInteractionProps<State extends PopupStoreState<unknown>>(
	store: ReactStore<State, PopupStoreContext<never>, typeof popupStoreSelectors>,
	statePart: Partial<State>,
	slot: symbol | undefined,
) {
	store.useSyncedValues(statePart, subSlot(slot, 'sync'));

	useLayoutEffect(
		() => () => {
			store.update({
				activeTriggerProps: EMPTY_OBJECT,
				inactiveTriggerProps: EMPTY_OBJECT,
				popupProps: EMPTY_OBJECT,
			} as unknown as Partial<State>);
		},
		[store],
		subSlot(slot, 'e'),
	);
}

export function usePopupRootSync<
	State extends PopupStoreState<unknown> & { openMethod: InteractionType | null },
>(
	store: ReactStore<State, PopupStoreContext<never>, typeof popupStoreSelectors>,
	open: boolean,
	slot: symbol | undefined,
) {
	useLayoutEffect(
		() => {
			if (!open && store.state.openMethod !== null) {
				store.set('openMethod', null);
			}
		},
		[open, store],
		subSlot(slot, 'e1'),
	);

	useLayoutEffect(
		() => () => {
			if (store.state.openMethod !== null) {
				store.set('openMethod', null);
			}
		},
		[store],
		subSlot(slot, 'e2'),
	);
}
