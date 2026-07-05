// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useSyncedFloatingRootContext.ts
// (v1.6.0), octane-adapted (slot-threaded). Keeps a FloatingRootStore in sync with a popup store:
// reuses a provided root context, else creates one once and updates it each render from the popup
// store's open/reference/floating state.
import { useRef, useLayoutEffect } from 'octane';

import { subSlot } from '../../internal';
import { isElement } from '../dom';
import type { ReactStore } from '../store/ReactStore';
import type { PopupStoreContext, PopupStoreSelectors, PopupStoreState } from '../popups/store';
import { FloatingRootStore, type FloatingRootState } from './FloatingRootStore';

export interface UseSyncedFloatingRootContextOptions<State extends PopupStoreState<unknown>> {
	popupStore: ReactStore<State, PopupStoreContext<any>, PopupStoreSelectors>;
	treatPopupAsFloatingElement?: boolean | undefined;
	floatingRootContext?: FloatingRootStore | undefined;
	floatingId: string | undefined;
	nested: boolean;
	onOpenChange(open: boolean, eventDetails: any): void;
}

export function useSyncedFloatingRootContext<State extends PopupStoreState<unknown>>(
	options: UseSyncedFloatingRootContextOptions<State>,
	slot: symbol | undefined,
): FloatingRootStore {
	const {
		popupStore,
		treatPopupAsFloatingElement = false,
		floatingRootContext: floatingRootContextProp,
		floatingId,
		nested,
		onOpenChange,
	} = options;

	const open = popupStore.useState('open', subSlot(slot, 'open'));
	const referenceElement = popupStore.useState('activeTriggerElement', subSlot(slot, 'ref'));
	const floatingElement = popupStore.useState(
		treatPopupAsFloatingElement ? 'popupElement' : 'positionerElement',
		subSlot(slot, 'floating'),
	);
	const triggerElements = popupStore.context.triggerElements;

	const handleOpenChange = onOpenChange as (open: boolean, eventDetails: any) => void;

	const internalStoreRef = useRef<FloatingRootStore | null>(null, subSlot(slot, 'store'));
	if (floatingRootContextProp === undefined && internalStoreRef.current === null) {
		internalStoreRef.current = new FloatingRootStore({
			open,
			transitionStatus: undefined,
			referenceElement,
			floatingElement,
			triggerElements,
			onOpenChange: handleOpenChange,
			floatingId,
			syncOnly: true,
			nested,
		});
	}

	const store = floatingRootContextProp ?? internalStoreRef.current!;

	popupStore.useSyncedValue(
		'floatingId',
		floatingId as State['floatingId'],
		subSlot(slot, 'syncId'),
	);

	useLayoutEffect(
		() => {
			const valuesToSync: Partial<FloatingRootState> = {
				open,
				floatingId,
				referenceElement,
				floatingElement,
			};
			if (isElement(referenceElement)) {
				valuesToSync.domReferenceElement = referenceElement;
			}
			if (store.state.positionReference === store.state.referenceElement) {
				valuesToSync.positionReference = referenceElement;
			}
			store.update(valuesToSync);
		},
		[open, floatingId, referenceElement, floatingElement, store],
		subSlot(slot, 'e:sync'),
	);

	// Keep non-reactive context values fresh for interactions that call `store.setOpen`.
	store.context.onOpenChange = handleOpenChange;
	store.context.nested = nested;

	return store;
}
