// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useHoverInteractionSharedState.ts
// (v1.6.0). The reference-side and floating-side hover hooks act on ONE popup, so they share a
// single mutable interaction record parked on the floating root store's `dataRef` — pointer type,
// the live safe-polygon mousemove handler, the open/rest timers, and the pointer-events mutation
// that keeps the cursor's path to the popup clickable.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useEffect } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { Timeout } from '../useTimeout';
import { useRefWithInit } from '../useRefWithInit';
import type { HandleCloseOptions } from './useHoverShared';

export { isInteractiveElement } from './element';

export class HoverInteraction {
	pointerType: string | undefined = undefined;

	interactedInside = false;

	handler: ((event: MouseEvent) => void) | undefined = undefined;

	blockMouseMove = true;

	performedPointerEventsMutation = false;

	pointerEventsScopeElement: HTMLElement | SVGSVGElement | null = null;

	pointerEventsReferenceElement: HTMLElement | SVGSVGElement | null = null;

	pointerEventsFloatingElement: HTMLElement | null = null;

	restTimeoutPending = false;

	openChangeTimeout: Timeout = new Timeout();

	restTimeout: Timeout = new Timeout();

	handleCloseOptions: HandleCloseOptions | undefined = undefined;

	static create(): HoverInteraction {
		return new HoverInteraction();
	}

	dispose = (): void => {
		this.openChangeTimeout.clear();
		this.restTimeout.clear();
	};

	disposeEffect = (): (() => void) => {
		return this.dispose;
	};
}

type PointerEventsMutationState = Pick<
	HoverInteraction,
	| 'performedPointerEventsMutation'
	| 'pointerEventsScopeElement'
	| 'pointerEventsReferenceElement'
	| 'pointerEventsFloatingElement'
>;

// Only one interaction may own the pointer-events mutation for a given scope element, otherwise a
// sibling popup's cleanup would strip the styles the active one still needs.
const pointerEventsMutationOwnerByScopeElement = new WeakMap<
	HTMLElement | SVGSVGElement,
	PointerEventsMutationState
>();

export function clearSafePolygonPointerEventsMutation(instance: PointerEventsMutationState): void {
	if (!instance.performedPointerEventsMutation) {
		return;
	}

	const scopeElement = instance.pointerEventsScopeElement;

	if (scopeElement && pointerEventsMutationOwnerByScopeElement.get(scopeElement) === instance) {
		instance.pointerEventsScopeElement?.style.removeProperty('pointer-events');
		instance.pointerEventsReferenceElement?.style.removeProperty('pointer-events');
		instance.pointerEventsFloatingElement?.style.removeProperty('pointer-events');
		pointerEventsMutationOwnerByScopeElement.delete(scopeElement);
	}

	instance.performedPointerEventsMutation = false;
	instance.pointerEventsScopeElement = null;
	instance.pointerEventsReferenceElement = null;
	instance.pointerEventsFloatingElement = null;
}

export function applySafePolygonPointerEventsMutation(
	instance: PointerEventsMutationState,
	options: {
		scopeElement: HTMLElement | SVGSVGElement;
		referenceElement: HTMLElement | SVGSVGElement;
		floatingElement: HTMLElement;
	},
): void {
	const { scopeElement, referenceElement, floatingElement } = options;

	const existingOwner = pointerEventsMutationOwnerByScopeElement.get(scopeElement);
	if (existingOwner && existingOwner !== instance) {
		clearSafePolygonPointerEventsMutation(existingOwner);
	}

	clearSafePolygonPointerEventsMutation(instance);
	instance.performedPointerEventsMutation = true;
	instance.pointerEventsScopeElement = scopeElement;
	instance.pointerEventsReferenceElement = referenceElement;
	instance.pointerEventsFloatingElement = floatingElement;
	pointerEventsMutationOwnerByScopeElement.set(scopeElement, instance);

	scopeElement.style.pointerEvents = 'none';
	referenceElement.style.pointerEvents = 'auto';
	floatingElement.style.pointerEvents = 'auto';
}

export function useHoverInteractionSharedState(...args: any[]): HoverInteraction {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useHoverInteractionSharedState');
	const store = user[0] as any;

	const data = store.context.dataRef.current as {
		hoverInteractionState?: HoverInteraction | undefined;
	};
	const instance = useRefWithInit<HoverInteraction>(
		() => data.hoverInteractionState ?? HoverInteraction.create(),
		undefined,
		subSlot(slot, 'inst'),
	).current;

	if (!data.hoverInteractionState) {
		data.hoverInteractionState = instance;
	}

	useEffect(data.hoverInteractionState.disposeEffect, [], subSlot(slot, 'e:mount'));

	return data.hoverInteractionState;
}
