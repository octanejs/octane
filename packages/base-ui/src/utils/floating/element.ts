// Ported from .base-ui/packages/react/src/floating-ui-react/utils/element.ts (v1.6.0) — the subset
// used so far. `getTarget` is reused from the composite list utils.
import { isHTMLElement } from '../dom';
import { TYPEABLE_SELECTOR } from './constants';

export { getTarget } from '../composite/list-utils';

export function isTypeableElement(element: unknown): boolean {
	return isHTMLElement(element) && element.matches(TYPEABLE_SELECTOR);
}
