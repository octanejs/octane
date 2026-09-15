// Adapted from react-hook-form@7.88.0 src/logic/hasPromiseValidation.ts for Octane.
import type { Field, Validate } from '../types';
import isFunction from '../utils/isFunction';
import isObject from '../utils/isObject';

const ASYNC_FUNCTION = 'AsyncFunction';

export default (fieldReference: Field['_f']) => {
	if (!fieldReference || !fieldReference.validate) return false;

	if (isFunction(fieldReference.validate)) {
		return fieldReference.validate.constructor.name === ASYNC_FUNCTION;
	}

	if (isObject(fieldReference.validate)) {
		for (const key in fieldReference.validate) {
			if (
				(fieldReference.validate[key] as Validate<unknown, unknown>).constructor.name ===
				ASYNC_FUNCTION
			) {
				return true;
			}
		}
	}

	return false;
};
