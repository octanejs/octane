// octane analogue of @base-ui/utils/getReactElementRef
// (.base-ui/packages/utils/src/getReactElementRef.ts). octane is ref-as-prop
// (React-19 shape), so a descriptor's ref lives in `props.ref`. Returns null for
// a non-element (function render prop, text, null).
import { isValidElement } from 'octane';

export function getElementRef(element: unknown): any {
	if (!isValidElement(element)) {
		return null;
	}
	const props = (element as any).props as { ref?: any } | undefined;
	return props?.ref ?? null;
}
