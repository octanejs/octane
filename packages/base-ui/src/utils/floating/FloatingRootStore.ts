// Ported from .base-ui/packages/react/src/floating-ui-react/components/FloatingRootStore.ts
// (v1.6.0). The Store-based root context every Base UI popup's floating interactions read
// (`store.useState('open')`, `store.context.dataRef`, …) — Base UI's 1.6.0 replacement for
// upstream `@floating-ui/react`'s emitter-only root context. Extends the octane-adapted
// `ReactStore`; pure otherwise.
import { createSelector } from '../store/createSelector';
import { ReactStore } from '../store/ReactStore';
import type { TransitionStatus } from '../useTransitionStatus';
import type { PopupTriggerMap } from '../popups/popupTriggerMap';
import { createEventEmitter } from './createEventEmitter';
import { isClickLikeEvent } from './event';
import type { FloatingEvents, ContextData, ReferenceType } from './types';

interface BaseUIChangeEventDetails {
	reason: string;
	event: Event;
	trigger?: Element | undefined;
	[key: string]: any;
}

interface FloatingUIOpenChangeDetails {
	open: boolean;
	reason: string;
	nativeEvent: Event | undefined;
	nested: boolean;
	triggerElement?: Element | undefined;
}

export interface FloatingRootState {
	open: boolean;
	transitionStatus: TransitionStatus | undefined;
	domReferenceElement: Element | null;
	referenceElement: ReferenceType | null;
	floatingElement: HTMLElement | null;
	positionReference: ReferenceType | null;
	floatingId: string | undefined;
}

export interface FloatingRootStoreContext {
	onOpenChange: ((open: boolean, eventDetails: BaseUIChangeEventDetails) => void) | undefined;
	readonly dataRef: { current: ContextData };
	readonly events: FloatingEvents;
	nested: boolean;
	readonly triggerElements: PopupTriggerMap;
}

const selectors = {
	open: createSelector((state: FloatingRootState) => state.open),
	transitionStatus: createSelector((state: FloatingRootState) => state.transitionStatus),
	domReferenceElement: createSelector((state: FloatingRootState) => state.domReferenceElement),
	referenceElement: createSelector(
		(state: FloatingRootState) => state.positionReference ?? state.referenceElement,
	),
	floatingElement: createSelector((state: FloatingRootState) => state.floatingElement),
	floatingId: createSelector((state: FloatingRootState) => state.floatingId),
};

interface FloatingRootStoreOptions {
	open: boolean;
	transitionStatus: TransitionStatus | undefined;
	referenceElement: ReferenceType | null;
	floatingElement: HTMLElement | null;
	triggerElements: PopupTriggerMap;
	floatingId: string | undefined;
	syncOnly: boolean;
	nested: boolean;
	onOpenChange: ((open: boolean, eventDetails: BaseUIChangeEventDetails) => void) | undefined;
}

export class FloatingRootStore extends ReactStore<
	Readonly<FloatingRootState>,
	FloatingRootStoreContext,
	typeof selectors
> {
	private readonly syncOnly: boolean;

	constructor(options: FloatingRootStoreOptions) {
		const { syncOnly, nested, onOpenChange, triggerElements, ...initialState } = options;

		super(
			{
				...initialState,
				positionReference: initialState.referenceElement,
				domReferenceElement: initialState.referenceElement as Element | null,
			},
			{
				onOpenChange,
				dataRef: { current: {} },
				events: createEventEmitter(),
				nested,
				triggerElements,
			},
			selectors,
		);

		this.syncOnly = syncOnly;
	}

	syncOpenEvent = (newOpen: boolean, event: Event | undefined) => {
		if (!newOpen || !this.state.open || (event != null && isClickLikeEvent(event))) {
			this.context.dataRef.current.openEvent = newOpen ? event : undefined;
		}
	};

	dispatchOpenChange = (newOpen: boolean, eventDetails: BaseUIChangeEventDetails) => {
		this.syncOpenEvent(newOpen, eventDetails.event);

		const details: FloatingUIOpenChangeDetails = {
			open: newOpen,
			reason: eventDetails.reason,
			nativeEvent: eventDetails.event,
			nested: this.context.nested,
			triggerElement: eventDetails.trigger,
		};

		this.context.events.emit('openchange', details);
	};

	setOpen = (newOpen: boolean, eventDetails: BaseUIChangeEventDetails) => {
		if (this.syncOnly) {
			this.context.onOpenChange?.(newOpen, eventDetails);
			return;
		}
		this.dispatchOpenChange(newOpen, eventDetails);
		this.context.onOpenChange?.(newOpen, eventDetails);
	};
}
