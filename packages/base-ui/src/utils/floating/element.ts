// Ported from .base-ui/packages/react/src/floating-ui-react/utils/element.ts (v1.6.0) — the subset
// used so far. `getTarget` is reused from the composite list utils.
import { isHTMLElement } from '../dom';
import { TYPEABLE_SELECTOR, FOCUSABLE_ATTRIBUTE } from './constants';

export { getTarget } from '../composite/list-utils';
export { contains } from '../contains';

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
