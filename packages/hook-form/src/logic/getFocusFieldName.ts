// Vendored from react-hook-form@7.81.0 src/logic/getFocusFieldName.ts (octane port).
import type { FieldArrayMethodProps, InternalFieldName } from '../types';
import isUndefined from '../utils/isUndefined';

export default (
	name: InternalFieldName,
	index: number,
	options: FieldArrayMethodProps = {},
): string =>
	options.shouldFocus || isUndefined(options.shouldFocus)
		? options.focusName ||
			`${name}.${isUndefined(options.focusIndex) ? index : options.focusIndex}.`
		: '';
