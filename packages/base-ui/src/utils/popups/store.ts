// Ported from .base-ui/packages/react/src/utils/popups/store.ts (v1.6.0). The state shape, initial
// state, floating-root-context factory, and selectors shared by EVERY popup store (Dialog/Popover/
// Tooltip/Menu/PreviewCard). Pure — octane adaptations are only import paths + `HTMLProps` inlined.
import { createSelector } from '../store/createSelector';
import { EMPTY_OBJECT } from '../empty';
import type { FloatingRootContext } from '../floating/types';
import { FloatingRootStore } from '../floating/FloatingRootStore';
import { getEmptyRootContext } from '../floating/getEmptyRootContext';
import type { TransitionStatus } from '../useTransitionStatus';
import { PopupTriggerMap } from './popupTriggerMap';

type HTMLProps = Record<string, any>;

export type PopupStoreState<Payload> = {
	open: boolean;
	readonly openProp: boolean | undefined;
	mounted: boolean;
	transitionStatus: TransitionStatus;
	floatingRootContext: FloatingRootContext;
	floatingId: string | undefined;
	triggerCount: number;
	preventUnmountingOnClose: boolean;
	payload: Payload | undefined;
	activeTriggerId: string | null;
	activeTriggerElement: Element | null;
	readonly triggerIdProp: string | null | undefined;
	popupElement: HTMLElement | null;
	positionerElement: HTMLElement | null;
	activeTriggerProps: HTMLProps;
	inactiveTriggerProps: HTMLProps;
	popupProps: HTMLProps;
};

export function createInitialPopupStoreState<Payload>(): PopupStoreState<Payload> {
	return {
		open: false,
		openProp: undefined,
		mounted: false,
		transitionStatus: undefined,
		floatingRootContext: getEmptyRootContext(),
		floatingId: undefined,
		triggerCount: 0,
		preventUnmountingOnClose: false,
		payload: undefined,
		activeTriggerId: null,
		activeTriggerElement: null,
		triggerIdProp: undefined,
		popupElement: null,
		positionerElement: null,
		activeTriggerProps: EMPTY_OBJECT as HTMLProps,
		inactiveTriggerProps: EMPTY_OBJECT as HTMLProps,
		popupProps: EMPTY_OBJECT as HTMLProps,
	};
}

export function createPopupFloatingRootContext(
	triggerElements: PopupTriggerMap,
	floatingId?: string | undefined,
	nested = false,
) {
	return new FloatingRootStore({
		open: false,
		transitionStatus: undefined,
		floatingElement: null,
		referenceElement: null,
		triggerElements,
		floatingId,
		syncOnly: true,
		nested,
		onOpenChange: undefined,
	});
}

export type PopupStoreContext<ChangeEventDetails> = {
	readonly triggerElements: PopupTriggerMap;
	readonly popupRef: { current: HTMLElement | null };
	onOpenChange?: ((open: boolean, eventDetails: ChangeEventDetails) => void) | undefined;
	onOpenChangeComplete: ((open: boolean) => void) | undefined;
};

type S = PopupStoreState<unknown>;

const activeTriggerIdSelector = createSelector(
	(state: S) => state.triggerIdProp ?? state.activeTriggerId,
);

const openSelector = createSelector((state: S) => state.openProp ?? state.open);

const popupIdSelector = createSelector((state: S) => {
	const popupId = state.popupElement?.id ?? state.floatingId;
	return popupId || undefined;
});

function triggerOwnsOpenPopup(state: S, triggerId: string | undefined) {
	return (
		triggerId !== undefined && openSelector(state) && activeTriggerIdSelector(state) === triggerId
	);
}

function triggerOwnsOpenPopupOrIsOnlyTrigger(state: S, triggerId: string | undefined) {
	if (triggerOwnsOpenPopup(state, triggerId)) {
		return true;
	}
	return (
		triggerId !== undefined &&
		openSelector(state) &&
		activeTriggerIdSelector(state) == null &&
		state.triggerCount === 1
	);
}

export const popupStoreSelectors = {
	open: openSelector,
	mounted: createSelector((state: S) => state.mounted),
	transitionStatus: createSelector((state: S) => state.transitionStatus),
	floatingRootContext: createSelector((state: S) => state.floatingRootContext),
	triggerCount: createSelector((state: S) => state.triggerCount),
	preventUnmountingOnClose: createSelector((state: S) => state.preventUnmountingOnClose),
	payload: createSelector((state: S) => state.payload),
	activeTriggerId: activeTriggerIdSelector,
	activeTriggerElement: createSelector((state: S) =>
		state.mounted ? state.activeTriggerElement : null,
	),
	popupId: popupIdSelector,
	isTriggerActive: createSelector(
		(state: S, triggerId: string | undefined) =>
			triggerId !== undefined && activeTriggerIdSelector(state) === triggerId,
	),
	isOpenedByTrigger: createSelector((state: S, triggerId: string | undefined) =>
		triggerOwnsOpenPopup(state, triggerId),
	),
	isMountedByTrigger: createSelector(
		(state: S, triggerId: string | undefined) =>
			triggerId !== undefined && activeTriggerIdSelector(state) === triggerId && state.mounted,
	),
	triggerProps: createSelector((state: S, isActive: boolean) =>
		isActive ? state.activeTriggerProps : state.inactiveTriggerProps,
	),
	triggerPopupId: createSelector((state: S, triggerId: string | undefined) =>
		triggerOwnsOpenPopupOrIsOnlyTrigger(state, triggerId) ? popupIdSelector(state) : undefined,
	),
	popupProps: createSelector((state: S) => state.popupProps),
	popupElement: createSelector((state: S) => state.popupElement),
	positionerElement: createSelector((state: S) => state.positionerElement),
};

export type PopupStoreSelectors = typeof popupStoreSelectors;
