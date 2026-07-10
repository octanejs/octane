// Vendored from react-hook-form@7.81.0 src/logic/updateFieldArrayRootError.ts (octane port).
import { ROOT_ERROR_TYPE } from '../constants';
import type { FieldError, FieldErrors, FieldValues, InternalFieldName } from '../types';
import get from '../utils/get';
import set from '../utils/set';

export default <T extends FieldValues = FieldValues>(
	errors: FieldErrors<T>,
	error: Partial<Record<string, FieldError>>,
	name: InternalFieldName,
): FieldErrors<T> => {
	const existingErrors = get(errors, name);
	const fieldArrayErrors = Array.isArray(existingErrors) ? existingErrors : [];
	set(fieldArrayErrors, ROOT_ERROR_TYPE, error[name]);
	set(errors, name, fieldArrayErrors);
	return errors;
};
