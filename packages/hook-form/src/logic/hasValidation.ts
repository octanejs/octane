// Vendored from react-hook-form@7.81.0 src/logic/hasValidation.ts (octane port).
import type { Field } from '../types';

export default (options: Field['_f']) =>
	options.mount &&
	(options.required ||
		options.min ||
		options.max ||
		options.maxLength ||
		options.minLength ||
		options.pattern ||
		options.validate);
