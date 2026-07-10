// Vendored from react-hook-form@7.81.0 src/utils/isObject.ts (octane port).
import isDateObject from './isDateObject';
import isNullOrUndefined from './isNullOrUndefined';

export const isObjectType = (value: unknown): value is object => typeof value === 'object';

export default <T extends object>(value: unknown): value is T =>
	!isNullOrUndefined(value) && !Array.isArray(value) && isObjectType(value) && !isDateObject(value);
