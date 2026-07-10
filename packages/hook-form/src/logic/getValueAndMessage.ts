// Vendored from react-hook-form@7.81.0 src/logic/getValueAndMessage.ts (octane port).
import type { ValidationRule } from '../types';
import isObject from '../utils/isObject';
import isRegex from '../utils/isRegex';

export default (validationData?: ValidationRule) =>
	isObject(validationData) && !isRegex(validationData)
		? validationData
		: {
				value: validationData,
				message: '',
			};
