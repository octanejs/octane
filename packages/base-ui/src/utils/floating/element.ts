// Ported from .base-ui/packages/react/src/floating-ui-react/utils/element.ts (v1.6.0) — the subset
// used so far. `getTarget` is reused from the composite list utils.
import { isElement, isHTMLElement } from '../dom';
import type { PopupTriggerMap } from '../popups/popupTriggerMap';
import { TYPEABLE_SELECTOR, FOCUSABLE_ATTRIBUTE } from './constants';

import { contains } from '../contains';

export { getTarget } from '../composite/list-utils';
export { contains };

// Whether the target sits on (or inside) one of this popup's triggers, and that trigger is not
// marked disabled. Hover uses it to keep a popup open while the cursor crosses between triggers.
export function isTargetInsideEnabledTrigger(
	target: EventTarget | null,
	triggerElements: PopupTriggerMap,
): boolean {
	if (!isElement(target)) {
		return false;
	}
	const targetElement = target as Element;
	if (triggerElements.hasElement(targetElement)) {
		return !targetElement.hasAttribute('data-trigger-disabled');
	}
	for (const [, trigger] of triggerElements.entries()) {
		if (contains(trigger, targetElement)) {
			return !trigger.hasAttribute('data-trigger-disabled');
		}
	}
	return false;
}

// Whether the element (or an ancestor) is something the user can interact with directly — used to
// decide whether a pointerdown inside a popup counts as a click-like open.
export function isInteractiveElement(element: Element | null): boolean {
	return (
		element?.closest(
			`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${TYPEABLE_SELECTOR}`,
		) != null
	);
}

// Ported from .base-ui/…/internals/shadowDom.ts — the deepest active element across shadow roots.
export function activeElement(doc: Document): Element | null {
	let element = doc.activeElement;
	while (element?.shadowRoot?.activeElement != null) {
		element = element.shadowRoot.activeElement;
	}
	return element;
}

export function isTypeableElement(element: unknown): boolean {
	return isHTMLElement(element) && element.matches(TYPEABLE_SELECTOR);
}

export function isTypeableCombobox(element: Element | null): boolean {
	if (!element) {
		return false;
	}
	return element.getAttribute('role') === 'combobox' && isTypeableElement(element);
}

// The floating element may be a positioning wrapper; focus is managed on the child carrying the
// focusable marker (or the element itself).
export function getFloatingFocusElement(
	floatingElement: HTMLElement | null | undefined,
): HTMLElement | null {
	if (!floatingElement) {
		return null;
	}
	return floatingElement.hasAttribute(FOCUSABLE_ATTRIBUTE)
		? floatingElement
		: (floatingElement.querySelector<HTMLElement>(`[${FOCUSABLE_ATTRIBUTE}]`) ?? floatingElement);
}

export function isEventTargetWithin(event: Event, node: Node | null | undefined): boolean {
	if (node == null) {
		return false;
	}
	if ('composedPath' in event) {
		return event.composedPath().includes(node);
	}
	return (event as Event).target != null && node.contains((event as Event).target as Node);
}

export function isRootElement(element: Element): boolean {
	return element.matches('html,body');
}
