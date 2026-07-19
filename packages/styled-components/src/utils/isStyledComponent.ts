import { StyledComponentBrand } from '../types';

/**
 * Octane adaptation: upstream brands styled components with React's
 * forward-ref `$$typeof` so HOCs that hoist statics (and therefore inherit
 * `styledComponentId`) are not mistaken for real styled components. Octane
 * has no forwardRef, so the factory stamps this dedicated symbol instead —
 * `hoist` explicitly never copies it.
 */
export const STYLED_COMPONENT_BRAND = Symbol.for('@octanejs/styled-components:brand');

export default function isStyledComponent(target: any): target is StyledComponentBrand {
	return (
		target != null &&
		(typeof target === 'object' || typeof target === 'function') &&
		(target as any)[STYLED_COMPONENT_BRAND] === true &&
		'styledComponentId' in target
	);
}
