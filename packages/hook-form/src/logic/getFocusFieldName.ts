// Adapted from react-hook-form@7.88.0 src/logic/getFocusFieldName.ts for Octane.
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
