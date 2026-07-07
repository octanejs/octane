// Ported from .base-ui/packages/react/src/utils/popups/useTriggerFocusGuards.ts (v1.6.0), octane-
// adapted (native events; `ReactDOM.flushSync` → octane `flushSync`; the ref threads a slot). Focus
// guards placed around an OPEN popup's trigger (Popover/Menu): tabbing out of the trigger closes the
// popup and moves focus to the right neighbour.
import { useRef, flushSync } from 'octane';

import { subSlot } from '../../internal';
import { contains } from '../floating/element';
import {
	getNextTabbable,
	getTabbableAfterElement,
	getTabbableBeforeElement,
	isOutsideEvent,
	type FocusableElement,
} from '../floating/tabbable';
import { createChangeEventDetails, REASONS } from '../createChangeEventDetails';

interface TriggerFocusGuardStore {
	setOpen(open: boolean, eventDetails: any): void;
	select(key: 'positionerElement'): HTMLElement | null;
	context: {
		readonly beforeContentFocusGuardRef: { current: HTMLElement | null };
		readonly triggerFocusTargetRef: { current: HTMLElement | null };
	};
}

export function useTriggerFocusGuards(
	store: TriggerFocusGuardStore,
	triggerElementRef: { current: HTMLElement | null },
	slot: symbol | undefined,
) {
	const preFocusGuardRef = useRef<HTMLElement | null>(null, subSlot(slot, 'pre'));

	function handlePreFocusGuardFocus(event: any) {
		flushSync(() => {
			store.setOpen(
				false,
				createChangeEventDetails(REASONS.focusOut, event, event.currentTarget as HTMLElement),
			);
		});
		const previousTabbable: FocusableElement | null = getTabbableBeforeElement(
			preFocusGuardRef.current,
		);
		previousTabbable?.focus();
	}

	function handleFocusTargetFocus(event: any) {
		const positionerElement = store.select('positionerElement');
		if (positionerElement && isOutsideEvent(event, positionerElement)) {
			store.context.beforeContentFocusGuardRef.current?.focus();
		} else {
			flushSync(() => {
				store.setOpen(
					false,
					createChangeEventDetails(REASONS.focusOut, event, event.currentTarget as HTMLElement),
				);
			});
			let nextTabbable = getTabbableAfterElement(
				store.context.triggerFocusTargetRef.current || triggerElementRef.current,
			);
			while (nextTabbable !== null && contains(positionerElement, nextTabbable)) {
				const prevTabbable = nextTabbable;
				nextTabbable = getNextTabbable(nextTabbable);
				if (nextTabbable === prevTabbable) {
					break;
				}
			}
			nextTabbable?.focus();
		}
	}

	return { preFocusGuardRef, handlePreFocusGuardFocus, handleFocusTargetFocus };
}
