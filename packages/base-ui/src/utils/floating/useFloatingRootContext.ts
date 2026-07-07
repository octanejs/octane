// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useFloatingRootContext.ts
// (v1.6.0), octane-adapted (slot-threaded). Creates the internal `FloatingRootStore` used when a
// consumer of `useFloating` doesn't pass its own `rootContext`. `floatingId` is a raw octane
// `useId` (no prefix), matching Base UI's `@base-ui/utils/useId`, so portal/popup ids stay
// byte-identical across the differential.
import { useId, useLayoutEffect } from 'octane';

import { S, subSlot } from '../../internal';
import { isElement } from '../dom';
import { useRefWithInit } from '../useRefWithInit';
import { PopupTriggerMap } from '../popups';
import { useFloatingParentNodeId } from './FloatingTree';
import { FloatingRootStore, type FloatingRootState } from './FloatingRootStore';

export interface UseFloatingRootContextOptions {
	open?: boolean | undefined;
	onOpenChange?(open: boolean, eventDetails: any): void;
	elements?:
		| {
				reference?: any;
				floating?: HTMLElement | null | undefined;
		  }
		| undefined;
}

export function useFloatingRootContext(
	options: UseFloatingRootContextOptions,
	slot: symbol | undefined,
): FloatingRootStore {
	const localSlot = slot ?? S('useFloatingRootContext');
	const { open = false, onOpenChange, elements = {} } = options;

	const floatingId = useId(subSlot(localSlot, 'id'));
	const nested = useFloatingParentNodeId() != null;

	const store = useRefWithInit<FloatingRootStore>(
		() =>
			new FloatingRootStore({
				open,
				transitionStatus: undefined,
				onOpenChange,
				referenceElement: elements.reference ?? null,
				floatingElement: elements.floating ?? null,
				triggerElements: new PopupTriggerMap(),
				floatingId,
				syncOnly: false,
				nested,
			}),
		subSlot(localSlot, 'store'),
	).current;

	useLayoutEffect(
		() => {
			const valuesToSync: Partial<FloatingRootState> = {
				open,
				floatingId,
			};

			// Only sync elements that are defined to avoid overwriting existing ones
			if (elements.reference !== undefined) {
				valuesToSync.referenceElement = elements.reference;
				valuesToSync.domReferenceElement = isElement(elements.reference)
					? elements.reference
					: null;
			}

			if (elements.floating !== undefined) {
				valuesToSync.floatingElement = elements.floating;
			}

			store.update(valuesToSync);
		},
		[open, floatingId, elements.reference, elements.floating, store],
		subSlot(localSlot, 'eff'),
	);

	store.context.onOpenChange = onOpenChange;
	store.context.nested = nested;

	return store;
}
