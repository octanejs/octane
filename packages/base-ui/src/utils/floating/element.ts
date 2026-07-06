// Ported from .base-ui/packages/react/src/floating-ui-react/utils/element.ts (v1.6.0) — the subset
// used so far. `getTarget` is reused from the composite list utils.
import { isHTMLElement } from '../dom';
import { TYPEABLE_SELECTOR } from './constants';

export { getTarget } from '../composite/list-utils';
export { contains } from '../contains';

export function isTypeableElement(element: unknown): boolean {
	return isHTMLElement(element) && element.matches(TYPEABLE_SELECTOR);
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
